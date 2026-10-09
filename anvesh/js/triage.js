/* ==========================================================================
   MediFlow | js/triage.js
   --------------------------------------------------------------------------
   RULE-BASED TRIAGE ASSISTANCE
   --------------------------------------------------------------------------
   What this module does
     Reads the information a staff member entered (warning-sign checkboxes,
     reported symptoms, symptom duration, vital signs, arrival source) and
     produces a PROVISIONAL priority suggestion together with the exact list of
     rules that produced it.

   What this module deliberately does NOT do
     * It does not diagnose anything.
     * It does not replace a clinician.
     * It does not decide the final priority: a staff member confirms or
       overrides every suggestion, and the override reason is stored separately.

   Safety design rules (see also README)
     1. A checked or text-detected WARNING SIGN -> Level 1 and a critical
        alert. Immediate clinical assessment must not be delayed.
     2. Age is NEVER used on its own. It only adds a point when another
        signal is already present.
     3. A single symptom never produces Level 2. Level 2 needs a combination
        (score >= 6), so no patient is escalated on one soft keyword.
     4. Missing or critically abnormal vital signs never produce a low
        priority. They raise the suggestion and/or flag "staff review
        required" instead.
     5. Every reason is returned to the UI so nothing is a black box.

   Public API
     triage.detectRedFlags(text, redFlagList) -> [flag]
     triage.evaluateVitals(vitals)            -> { perVital, messages, criticalCount, abnormalCount, missing }
     triage.assess(input, settings)           -> assessment result
     triage.describeLevel(level)              -> level descriptor
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.triage = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;

  /* ---------------------------------------------------------------------
     Helpers
     --------------------------------------------------------------------- */

  function levelInfo(level) {
    return cfg.PRIORITY_LEVELS[level] || cfg.PRIORITY_LEVELS[4];
  }

  function describeLevel(level) {
    var info = levelInfo(level);
    return {
      level: info.level,
      code: info.code,
      label: info.label,
      name: info.name,
      description: info.description,
      action: info.action
    };
  }

  function reason(text, kind, points, ruleId) {
    return {
      text: text,
      kind: kind || 'neutral',       /* critical | vital | symptom | review | neutral */
      points: points || 0,
      ruleId: ruleId || null
    };
  }

  /* ---------------------------------------------------------------------
     1. Warning-sign detection
     --------------------------------------------------------------------- */

  /** Match the free-text symptom description against the warning-sign keywords. */
  function detectRedFlags(text, redFlagList) {
    var haystack = String(text || '').toLowerCase();
    var list = Array.isArray(redFlagList) ? redFlagList : cfg.RED_FLAGS;
    if (!haystack.trim()) return [];
    var found = [];
    list.forEach(function (flag) {
      var keywords = flag.keywords || [];
      for (var i = 0; i < keywords.length; i++) {
        var keyword = String(keywords[i] || '').toLowerCase().trim();
        if (!keyword) continue;
        if (haystack.indexOf(keyword) !== -1) {
          found.push({ id: flag.id, label: flag.label, matched: keywords[i], source: 'text' });
          return;
        }
      }
    });
    return found;
  }

  /* ---------------------------------------------------------------------
     2. Vital-sign evaluation
     --------------------------------------------------------------------- */

  var VITAL_ORDER = ['temperature', 'pulse', 'spo2', 'systolic', 'diastolic'];

  /**
   * Compare recorded vitals with the configured plausibility ranges.
   * Returns a per-vital state used by the UI ("ok" | "warn" | "crit" | "missing")
   * plus human-readable messages for the triage reasons list.
   */
  function evaluateVitals(vitals) {
    var values = vitals || {};
    var perVital = {};
    var messages = [];
    var criticalCount = 0;
    var abnormalCount = 0;
    var recorded = 0;

    VITAL_ORDER.forEach(function (key) {
      var meta = cfg.VITALS[key];
      var value = U.num(values[key], null);
      if (value === null) {
        perVital[key] = { key: key, label: meta.label, unit: meta.unit, state: 'missing', value: null };
        return;
      }
      recorded++;
      var state = 'ok';
      var note = '';

      if (key === 'spo2') {
        if (value < meta.criticalLow) { state = 'crit'; note = 'Below ' + meta.criticalLow + '% – urgent review'; }
        else if (value < meta.warnLow) { state = 'warn'; note = 'Below ' + meta.warnLow + '% – below expected range'; }
      } else if (key === 'temperature') {
        if (value >= meta.criticalHigh || value <= meta.criticalLow) { state = 'crit'; note = 'Far outside the normal range'; }
        else if (value >= meta.warnHigh || value <= meta.warnLow) { state = 'warn'; note = 'Outside the usual range'; }
      } else {
        if (value >= meta.criticalHigh || value <= meta.criticalLow) { state = 'crit'; note = (value >= meta.criticalHigh ? 'Markedly high' : 'Markedly low'); }
        else if (value >= meta.warnHigh || value <= meta.warnLow) { state = 'warn'; note = 'Outside the usual range'; }
      }

      if (state === 'crit') criticalCount++;
      else if (state === 'warn') abnormalCount++;

      perVital[key] = { key: key, label: meta.label, unit: meta.unit, state: state, value: value, note: note };
      if (note) {
        messages.push({
          vital: key,
          state: state,
          text: meta.label + ' ' + value + ' ' + meta.unit + ' – ' + note
        });
      }
    });

    /* Blood-pressure pair sanity: a very low systolic with a high diastolic
       ratio is not itself a diagnosis, but it is worth flagging for review.  */
    var systolic = U.num(values.systolic, null);
    var diastolic = U.num(values.diastolic, null);
    if (systolic !== null && diastolic !== null && systolic <= diastolic) {
      messages.push({
        vital: 'systolic',
        state: 'warn',
        text: 'Recorded blood pressure looks unusual (systolic is not higher than diastolic). Please re-check the cuff reading.'
      });
      perVital.systolic.state = perVital.systolic.state === 'ok' ? 'warn' : perVital.systolic.state;
    }

    return {
      perVital: perVital,
      messages: messages,
      criticalCount: criticalCount,
      abnormalCount: abnormalCount,
      recorded: recorded,
      missing: recorded === 0,
      total: VITAL_ORDER.length
    };
  }

  /* ---------------------------------------------------------------------
     3. Symptom keyword scanning
     --------------------------------------------------------------------- */

  function scanSymptoms(text, rules) {
    var haystack = String(text || '').toLowerCase();
    var list = Array.isArray(rules) && rules.length ? rules : cfg.SYMPTOM_RULES;
    var hits = [];
    if (!haystack.trim()) return hits;
    list.forEach(function (rule) {
      var keywords = rule.keywords || [];
      for (var i = 0; i < keywords.length; i++) {
        var keyword = String(keywords[i] || '').toLowerCase().trim();
        if (!keyword) continue;
        if (haystack.indexOf(keyword) !== -1) {
          hits.push({ id: rule.id, label: rule.label, points: U.num(rule.points, 0) || 0, level: rule.level, matched: keywords[i] });
          return;
        }
      }
    });
    return hits;
  }

  /* ---------------------------------------------------------------------
     4. Onset / duration reading
     --------------------------------------------------------------------- */

  var ACUTE_WORDS = ['minute', 'minutes', 'mins', 'hour', 'hrs', 'sudden', 'suddenly', 'just now', 'this morning', 'today', 'acute'];
  var CHRONIC_WORDS = ['week', 'weeks', 'month', 'months', 'year', 'years', 'long-standing', 'longstanding', 'chronic'];

  function readDuration(text) {
    var value = String(text || '').toLowerCase();
    if (!value.trim()) return { kind: 'unknown', label: '' };
    var hasChronic = CHRONIC_WORDS.some(function (word) { return value.indexOf(word) !== -1; });
    var hasAcute = ACUTE_WORDS.some(function (word) { return value.indexOf(word) !== -1; });
    if (hasChronic) return { kind: 'chronic', label: 'Symptoms reported over weeks or longer' };
    if (hasAcute) return { kind: 'acute', label: 'Symptoms of very recent or sudden onset' };
    return { kind: 'unknown', label: '' };
  }

  /* ---------------------------------------------------------------------
     5. Main assessment
     --------------------------------------------------------------------- */

  /**
   * @param {Object} input
   *        symptoms, symptomDuration, age, source, conditions, allergies,
   *        vitals {temperature,pulse,spo2,systolic,diastolic},
   *        redFlags [ids checked by staff]
   * @param {Object} settings  (optional) patient-specific tuning from Settings
   * @returns {Object} assessment
   */
  function assess(input, settings) {
    var data = input || {};
    var config = settings || (MediFlow.store && MediFlow.store.state ? MediFlow.store.state.settings : cfg.DEFAULT_SETTINGS);
    var redFlagList = (config && config.redFlags && config.redFlags.length) ? config.redFlags : cfg.RED_FLAGS;
    var symptomRules = (config && config.symptomRules && config.symptomRules.length) ? config.symptomRules : cfg.SYMPTOM_RULES;

    var reasons = [];
    var reviewNotes = [];
    var score = 0;

    /* --- 5a. Warning signs (checked by staff + detected in text) -------- */
    var checked = Array.isArray(data.redFlags) ? data.redFlags.slice() : [];
    var detected = detectRedFlags(data.symptoms, redFlagList).filter(function (flag) {
      return checked.indexOf(flag.id) === -1;
    });
    var activeFlags = redFlagList
      .filter(function (flag) { return checked.indexOf(flag.id) !== -1; })
      .map(function (flag) { return { id: flag.id, label: flag.label, source: 'staff' }; })
      .concat(detected);

    activeFlags.forEach(function (flag) {
      reasons.push(reason(
        'Critical warning sign: ' + flag.label +
        (flag.source === 'text' ? ' (detected from the reported symptoms)' : ' (reported by staff)') +
        ' — immediate clinical assessment is required.',
        'critical', 0, 'red_flag:' + flag.id
      ));
    });

    /* --- 5b. Vital signs -------------------------------------------------- */
    var vitals = evaluateVitals(data.vitals);
    var vitalsProvided = !vitals.missing;
    var criticalVitalReasons = [];

    cfg.VITAL_RULES.forEach(function (rule) {
      var meta = cfg.VITALS[rule.vital];
      var value = U.num((data.vitals || {})[rule.vital], null);
      if (value === null) return;
      var triggered = false;
      if (rule.test === 'lt') triggered = value < rule.value;
      else if (rule.test === 'lte') triggered = value <= rule.value;
      else if (rule.test === 'critical') triggered = value >= meta.criticalHigh || value <= meta.criticalLow;
      else if (rule.test === 'warn') triggered = value >= meta.warnHigh || value <= meta.warnLow;
      if (!triggered) return;

      /* Avoid double-counting: the 'critical' and 'warn' variants of the same
         vital should not both fire for one reading. */
      if (rule.test === 'warn' && (value >= meta.criticalHigh || value <= meta.criticalLow)) return;

      score += rule.points;
      var text = rule.label + ' — recorded ' + meta.label.toLowerCase() + ' ' + value + ' ' + meta.unit + '.';
      var kind = rule.severity === 'critical' ? 'critical' : 'vital';
      reasons.push(reason(text, kind, rule.points, 'vital:' + rule.id));
      if (rule.severity === 'critical') criticalVitalReasons.push(rule.label);
    });

    if (vitalsProvided) {
      reasons.push(reason(
        'Vital signs recorded: ' + vitals.recorded + ' of ' + vitals.total + ' observations entered' +
        (vitals.criticalCount || vitals.abnormalCount
          ? ' — ' + (vitals.criticalCount ? vitals.criticalCount + ' critical' : '') +
            (vitals.criticalCount && vitals.abnormalCount ? ' and ' : '') +
            (vitals.abnormalCount ? vitals.abnormalCount + ' outside the usual range' : '') + '.'
          : ', all within the usual range.'),
        (vitals.criticalCount || vitals.abnormalCount) ? 'vital' : 'neutral', 0, 'vitals:summary'
      ));
    }

    /* --- 5c. Reported symptoms ------------------------------------------- */
    var symptomHits = scanSymptoms(data.symptoms, symptomRules);
    symptomHits.forEach(function (hit) {
      score += hit.points;
      reasons.push(reason(
        'Reported symptom: ' + hit.label + (hit.matched ? ' (matched "' + hit.matched + '")' : '') + '.',
        'symptom', hit.points, 'symptom:' + hit.id
      ));
    });

    var strongHits = symptomHits.filter(function (hit) { return hit.points >= 3; });
    var symptomDetailGiven = U.hasMeaningfulText(data.symptoms, 2);

    /* --- 5d. Modifiers (never sufficient on their own) ------------------- */
    var age = U.num(data.age, null);
    var modifierPoints = 0;
    var ageModifierApplied = false;

    var hasAnySignal = strongHits.length > 0 || symptomHits.length > 0 || criticalVitalReasons.length > 0 || !vitals.missing;
    if (age !== null && hasAnySignal && (age < 1 || age >= 75)) {
      /* Age is a modifier only. It can never move a patient into Level 1 and
         never applies when there is no other information at all.            */
      modifierPoints += 1;
      ageModifierApplied = true;
      reasons.push(reason(
        'Age ' + age + ' (' + U.ageBand(age) + ') adds a small caution. Age alone never changes priority in MediFlow — it only adds weight when other signs are already present.',
        'neutral', 1, 'modifier:age'
      ));
    }

    var duration = readDuration(data.symptomDuration);
    if (duration.kind === 'acute' && symptomHits.length > 0) {
      modifierPoints += 1;
      reasons.push(reason(
        'Symptom duration entered as "' + U.clean(data.symptomDuration, 40) + '" — recent or sudden onset adds weight.',
        'neutral', 1, 'modifier:acute_onset'
      ));
    } else if (duration.kind === 'chronic' && strongHits.length === 0 && vitals.criticalCount === 0) {
      modifierPoints -= 1;
      reasons.push(reason(
        'Symptom duration entered as "' + U.clean(data.symptomDuration, 40) + '" — a longer-standing pattern, which is commonly a non-acute presentation. Staff must still confirm this.',
        'neutral', -1, 'modifier:chronic'
      ));
    }

    var source = data.source === 'emergency' ? 'emergency' : 'outpatient';
    if (source === 'emergency' && score > 0) {
      modifierPoints += 1;
      reasons.push(reason('Registered through the Emergency Department, which adds a small weight to the provisional score.', 'neutral', 1, 'modifier:source'));
    }

    score += modifierPoints;
    if (score < 0) score = 0;

    /* --- 5e. Decide the provisional level -------------------------------- */
    var suggestedLevel;
    var basis;

    if (activeFlags.length) {
      suggestedLevel = 1;
      basis = 'warning-sign rule';
    } else {
      suggestedLevel = 4;
      for (var t = 0; t < cfg.SCORE_THRESHOLDS.length; t++) {
        if (score >= cfg.SCORE_THRESHOLDS[t].min) { suggestedLevel = cfg.SCORE_THRESHOLDS[t].level; break; }
      }
      /* A critically abnormal vital sign is never allowed to sit at Routine. */
      if (criticalVitalReasons.length && suggestedLevel > 2) {
        suggestedLevel = 2;
        basis = 'critical vital sign';
      } else {
        basis = 'combined score';
      }
      /* Deliberately: one symptom alone can never reach Level 2. */
      if (strongHits.length === 1 && suggestedLevel === 2 && score < 6) suggestedLevel = 3;
    }

    /* --- 5f. Missing-information safety net ------------------------------ */
    var requiresStaffReview = false;
    var cappedForMissingInfo = false;

    if (!vitalsProvided) {
      requiresStaffReview = true;
      if (source === 'emergency' && suggestedLevel > 3) {
        suggestedLevel = 3;
        cappedForMissingInfo = true;
      }
      reasons.push(reason(
        'No vital signs recorded. MediFlow will not rely on a low-priority classification without observations — please record temperature, pulse, oxygen saturation and blood pressure, or have a clinician review the patient.',
        'review', 0, 'review:no_vitals'
      ));
      reviewNotes.push('Vital signs not recorded');
    } else if (vitals.criticalCount > 0) {
      requiresStaffReview = true;
      reviewNotes.push('One or more critical vital signs');
    }

    if (!symptomDetailGiven) {
      requiresStaffReview = true;
      if (suggestedLevel > 3) {
        suggestedLevel = 3;
        cappedForMissingInfo = true;
      }
      reasons.push(reason(
        'The reported symptoms are too brief to support a routine classification. Please add a short description of what the patient reports, or ask a clinician to review.',
        'review', 0, 'review:thin_symptoms'
      ));
      reviewNotes.push('Symptom description is very brief');
    }

    if (cappedForMissingInfo) {
      reasons.push(reason(
        'The provisional level was raised because important information is missing. This is a safety rule, not a clinical judgement.',
        'review', 0, 'review:capped'
      ));
    }

    /* --- 5g. Nothing at all found ---------------------------------------- */
    if (!activeFlags.length && !symptomHits.length && vitals.missing) {
      reasons.push(reason(
        'No warning signs, recognised symptom patterns or vital signs were recorded, so MediFlow has almost nothing to work from. The provisional level below is the lowest it can safely suggest — a member of staff must confirm.',
        'review', 0, 'review:no_information'
      ));
      requiresStaffReview = true;
    }

    /* --- 5h. Summarise the basis ----------------------------------------- */
    var level = levelInfo(suggestedLevel);
    var summary =
      suggestedLevel === 1
        ? 'Provisional Level 1 (Critical): at least one critical warning sign was reported.'
        : suggestedLevel === 2
          ? 'Provisional Level 2 (High Priority): the combined signals suggest a rapid professional assessment is needed.'
          : suggestedLevel === 3
            ? 'Provisional Level 3 (Moderate): symptoms need a timely assessment.'
            : 'Provisional Level 4 (Routine): no warning signs were reported and the entered information looks stable. Staff must still confirm.';

    var criticalAlert = suggestedLevel === 1;

    if (criticalAlert) {
      reviewNotes.unshift('Critical warning sign reported');
    }

    return {
      suggestedLevel: suggestedLevel,
      suggested: describeLevel(suggestedLevel),
      criticalAlert: criticalAlert,
      requiresStaffReview: requiresStaffReview,
      reviewNotes: reviewNotes,
      score: Math.round(score * 10) / 10,
      basis: basis,
      summary: summary,
      reasons: reasons,
      redFlags: activeFlags,
      detectedFlags: detected,
      checkedFlags: checked,
      symptomHits: symptomHits,
      vitals: vitals,
      ageModifierApplied: ageModifierApplied,
      missingVitals: !vitalsProvided,
      assessedAt: U.nowIso(),
      disclaimer: cfg.DISCLAIMERS.triage
    };
  }

  /**
   * Compare a staff-confirmed level with the suggested level.
   * Used to decide whether an override reason is mandatory.
   */
  function compare(suggestedLevel, confirmedLevel) {
    var suggested = U.num(suggestedLevel, null);
    var confirmed = U.num(confirmedLevel, null);
    if (suggested === null || confirmed === null) return { changed: false, direction: 'none', moreUrgent: false, lessUrgent: false };
    var changed = suggested !== confirmed;
    return {
      changed: changed,
      direction: changed ? (confirmed < suggested ? 'more_urgent' : 'less_urgent') : 'none',
      moreUrgent: changed && confirmed < suggested,
      lessUrgent: changed && confirmed > suggested
    };
  }

  return {
    assess: assess,
    compare: compare,
    detectRedFlags: detectRedFlags,
    evaluateVitals: evaluateVitals,
    scanSymptoms: scanSymptoms,
    describeLevel: describeLevel,
    levelInfo: levelInfo
  };
})();
