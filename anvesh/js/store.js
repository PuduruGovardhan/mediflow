/* ==========================================================================
   MediFlow | js/store.js
   --------------------------------------------------------------------------
   The application state and every operation that changes a patient record.

   Design notes
     * One state object  ->  { version, meta, sequences, settings, patients }
     * Every mutation goes through a function here, appends a history entry,
       saves to storage and notifies subscribers. That is what keeps the
       dashboard, queue and analytics consistent with each other.
     * The suggested priority, the staff-confirmed priority and the override
       reason are stored in SEPARATE fields. Nothing overwrites the suggestion.
     * Patient IDs are generated from a persisted counter and checked against
       existing records, so duplicates cannot happen.

   Public API
     init()                                   bootstrap / load from storage
     subscribe(fn) -> unsubscribe             change notifications
     snapshot()                               read-only view for tests

     Queries : all, get, active, activeQueue, pendingTriage, counts, stats,
               byLevel, byDepartment, byStatus, recent, alerts
     Mutations: create, update, confirmPriority, setStatus, assignDepartment,
                addNote, cancel, markReassessment
     Bulk    : addDemoPatients, removeMany, clearDemo, clearAll, resetToEmpty
     Settings: updateSettings, resetSettings
     Data    : exportJson, importJson
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.store = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;

  /* ---------------------------------------------------------------------
     State
     --------------------------------------------------------------------- */

  var state = null;
  var subscribers = [];
  var lastChangeAt = null;

  function freshState() {
    return {
      version: cfg.STORAGE.schemaVersion,
      meta: {
        createdAt: U.nowIso(),
        updatedAt: U.nowIso(),
        dismissedAlerts: [],
        demoLoaded: false
      },
      sequences: { patient: cfg.APP.idStart },
      settings: U.clone(cfg.DEFAULT_SETTINGS),
      patients: []
    };
  }

  /** Bring any loaded payload up to the shape the app expects. */
  function normalise(loaded) {
    var base = freshState();
    if (!loaded || typeof loaded !== 'object') return base;

    var merged = U.deepMerge(base, {
      version: loaded.version || base.version,
      meta: loaded.meta || {},
      sequences: loaded.sequences || {},
      settings: loaded.settings || {},
      patients: Array.isArray(loaded.patients) ? loaded.patients : []
    });

    /* Settings lists must never be emptied accidentally: fall back to defaults. */
    if (!Array.isArray(merged.settings.redFlags) || !merged.settings.redFlags.length) {
      merged.settings.redFlags = U.clone(cfg.DEFAULT_SETTINGS.redFlags);
    }
    if (!Array.isArray(merged.settings.symptomRules) || !merged.settings.symptomRules.length) {
      merged.settings.symptomRules = U.clone(cfg.DEFAULT_SETTINGS.symptomRules);
    }
    if (!merged.settings.serviceMinutes || typeof merged.settings.serviceMinutes !== 'object') {
      merged.settings.serviceMinutes = U.clone(cfg.DEFAULT_SETTINGS.serviceMinutes);
    }
    if (!Array.isArray(merged.meta.dismissedAlerts)) merged.meta.dismissedAlerts = [];

    /* Repair each patient record defensively. */
    merged.patients = merged.patients.filter(function (p) { return p && p.id; }).map(function (p) {
      var patient = p;
      patient.notes = Array.isArray(patient.notes) ? patient.notes : [];
      patient.history = Array.isArray(patient.history) ? patient.history : [];
      patient.vitals = patient.vitals || {};
      patient.status = cfg.STATUSES[patient.status] ? patient.status : 'waiting';
      patient.source = patient.source === 'emergency' ? 'emergency' : 'outpatient';
      patient.confirmedPriority = U.num(patient.confirmedPriority, null);
      patient.suggestedPriority = U.num(patient.suggestedPriority, null);
      patient.demo = patient.demo === true;
      return patient;
    });

    return merged;
  }

  function init() {
    var loaded = MediFlow.storage.load();
    state = normalise(loaded);
    persist(false);
    return state;
  }

  function persist(notify) {
    state.meta.updatedAt = U.nowIso();
    lastChangeAt = new Date().toISOString();
    var ok = MediFlow.storage.save(state);
    if (notify !== false) emit('change');
    return ok;
  }

  /* ---------------------------------------------------------------------
     Subscriptions
     --------------------------------------------------------------------- */

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.push(fn);
    return function () {
      subscribers = subscribers.filter(function (item) { return item !== fn; });
    };
  }

  function emit(reason) {
    subscribers.forEach(function (fn) {
      try { fn(reason || 'change'); } catch (error) {
        /* A broken view must never break the rest of the app. */
        if (window.console && console.error) console.error('[MediFlow] subscriber failed', error);
      }
    });
  }

  /* ---------------------------------------------------------------------
     Small internal helpers
     --------------------------------------------------------------------- */

  function staffSignature(explicit) {
    if (explicit && String(explicit).trim()) return U.clean(explicit, 60);
    var settings = state.settings || {};
    return U.clean(settings.staffName || cfg.DEFAULT_SETTINGS.staffName, 60) || 'Staff member';
  }

  function pushHistory(patient, entry) {
    patient.history.push({
      at: entry.at || U.nowIso(),
      type: entry.type,
      from: entry.from === undefined ? null : entry.from,
      to: entry.to === undefined ? null : entry.to,
      by: entry.by || null,
      note: entry.note ? U.clean(entry.note, 400) : ''
    });
  }

  function levelName(level) {
    var info = cfg.PRIORITY_LEVELS[level];
    return info ? info.label + ' – ' + info.name : 'No priority confirmed';
  }

  function statusName(status) {
    return cfg.STATUSES[status] ? cfg.STATUSES[status].label : status;
  }

  function nextPatientId() {
    var used = {};
    state.patients.forEach(function (p) { used[p.id] = true; });
    var sequence = U.num(state.sequences.patient, cfg.APP.idStart) || cfg.APP.idStart;
    var candidate = cfg.APP.idPrefix + sequence;
    var guard = 0;
    while (used[candidate] && guard < 100000) {
      sequence += 1;
      candidate = cfg.APP.idPrefix + sequence;
      guard++;
    }
    state.sequences.patient = sequence + 1;
    return candidate;
  }

  function effectivePriority(patient) {
    var confirmed = U.num(patient.confirmedPriority, null);
    if (confirmed !== null) return confirmed;
    return U.num(patient.suggestedPriority, null);
  }

  /* ---------------------------------------------------------------------
     Validation (defence in depth – the form validates too)
     --------------------------------------------------------------------- */

  function validateDraft(draft) {
    var errors = {};
    var name = U.clean(draft.name, 80);
    if (!name || name.length < 2) errors.name = 'Enter the patient\u2019s full name (at least 2 characters).';

    var age = U.num(draft.age, null);
    if (age === null) errors.age = 'Enter the patient\u2019s age in years.';
    else if (age < 0 || age > 120) errors.age = 'Age must be between 0 and 120 years.';

    if (draft.phone && !U.isPhoneLike(draft.phone)) errors.phone = 'Phone number may contain digits, spaces and + ( ) - only.';

    var symptoms = U.clean(draft.symptoms, 500);
    if (!symptoms) errors.symptoms = 'Describe what the patient reports, even in a few words.';
    else if (symptoms.length < 3) errors.symptoms = 'The symptom description is too short.';

    if (cfg.SOURCES[draft.source] === undefined) errors.source = 'Choose how the patient arrived (emergency or outpatient).';
    if (draft.department && cfg.DEPARTMENTS.indexOf(draft.department) === -1) errors.department = 'Choose a department from the list.';

    /* Vital signs: reject values outside the plausible human range. */
    var vitals = draft.vitals || {};
    Object.keys(cfg.VITALS).forEach(function (key) {
      var value = U.num(vitals[key], null);
      if (value === null) return;
      var meta = cfg.VITALS[key];
      if (value < meta.min || value > meta.max) {
        errors['vital_' + key] = meta.label + ' must be between ' + meta.min + ' and ' + meta.max + ' ' + meta.unit + '.';
      }
    });

    var systolic = U.num(vitals.systolic, null);
    var diastolic = U.num(vitals.diastolic, null);
    if (systolic !== null && diastolic !== null && diastolic >= systolic) {
      errors.vital_diastolic = 'Diastolic pressure should be lower than the systolic pressure.';
    }

    return { ok: Object.keys(errors).length === 0, errors: errors, clean: { name: name, symptoms: symptoms } };
  }

  /* ---------------------------------------------------------------------
     Queries
     --------------------------------------------------------------------- */

  function all() { return state.patients.slice(); }

  function get(id) {
    for (var i = 0; i < state.patients.length; i++) {
      if (state.patients[i].id === id) return state.patients[i];
    }
    return null;
  }

  function isActive(patient) {
    return cfg.ACTIVE_STATUSES.indexOf(patient.status) !== -1;
  }

  function active() {
    return state.patients.filter(isActive);
  }

  /**
   * The live queue order, exactly as specified:
   *   1. staff-confirmed urgency, highest priority first (Level 1 -> Level 4)
   *   2. within the same priority, earliest registration first (FIFO)
   * Patients still awaiting triage confirmation are NOT in this list – see
   * pendingTriage() – so they can never be hidden behind confirmed patients.
   */
  function queueComparator(a, b) {
    var pa = U.num(a.confirmedPriority, null);
    var pb = U.num(b.confirmedPriority, null);
    if (pa === null) pa = 99;
    if (pb === null) pb = 99;
    if (pa !== pb) return pa - pb;
    var ta = U.toDate(a.registeredAt);
    var tb = U.toDate(b.registeredAt);
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return ta.getTime() - tb.getTime();
  }

  function activeQueue() {
    return state.patients
      .filter(function (p) { return isActive(p) && U.num(p.confirmedPriority, null) !== null; })
      .sort(queueComparator);
  }

  /** Patients whose priority has not been confirmed by staff yet. */
  function pendingTriage() {
    return state.patients
      .filter(function (p) { return isActive(p) && U.num(p.confirmedPriority, null) === null; })
      .sort(function (a, b) {
        var sa = U.num(a.suggestedPriority, 99);
        var sb = U.num(b.suggestedPriority, 99);
        if (sa !== sb) return sa - sb;
        return (U.toDate(a.registeredAt) || 0) - (U.toDate(b.registeredAt) || 0);
      });
  }

  /** Active patients showing a Level 1 warning sign and not yet dismissed. */
  function criticalAlerts() {
    var dismissed = state.meta.dismissedAlerts || [];
    return active().filter(function (p) {
      var level = U.num(p.confirmedPriority, null);
      var wasCritical = U.num(p.suggestedPriority, null) === 1 || p.criticalAlert === true;
      var nowCritical = level === 1;
      return (wasCritical || nowCritical) && dismissed.indexOf(p.id) === -1 && p.status !== 'completed' && p.status !== 'cancelled';
    }).sort(function (a, b) {
      return (U.toDate(a.registeredAt) || 0) - (U.toDate(b.registeredAt) || 0);
    });
  }

  function dismissAlert(id) {
    if (!state.meta.dismissedAlerts) state.meta.dismissedAlerts = [];
    if (state.meta.dismissedAlerts.indexOf(id) === -1) state.meta.dismissedAlerts.push(id);
    persist();
  }

  function counts() {
    var patients = state.patients;
    var out = { total: patients.length, waiting: 0, inConsultation: 0, completed: 0, cancelled: 0, reassessment: 0, urgent: 0, pendingTriage: 0, demo: 0 };
    patients.forEach(function (p) {
      if (p.demo) out.demo++;
      if (p.status === 'waiting') out.waiting++;
      else if (p.status === 'in_consultation') out.inConsultation++;
      else if (p.status === 'completed') out.completed++;
      else if (p.status === 'cancelled') out.cancelled++;
      else if (p.status === 'reassessment') out.reassessment++;
      if (isActive(p)) {
        var level = effectivePriority(p);
        if (level !== null && level <= 2) out.urgent++;
        if (U.num(p.confirmedPriority, null) === null) out.pendingTriage++;
      }
    });
    return out;
  }

  function stats() {
    var countsResult = counts();
    var queue = activeQueue();
    var summary = MediFlow.waiting.summary(queue);
    var today = U.startOfDay(new Date());
    var registeredToday = state.patients.filter(function (p) { return U.toDate(p.registeredAt) >= today; }).length;
    var completedToday = state.patients.filter(function (p) { return p.completedAt && U.toDate(p.completedAt) >= today; }).length;
    return {
      counts: countsResult,
      queueLength: queue.length,
      pending: pendingTriage().length,
      registeredToday: registeredToday,
      completedToday: completedToday,
      wait: summary,
      distribution: byLevel(),
      departments: byDepartment(),
      statuses: byStatus()
    };
  }

  /** Distribution of ACTIVE patients by (effective) priority level. */
  function byLevel() {
    var out = { 1: 0, 2: 0, 3: 0, 4: 0, unconfirmed: 0 };
    active().forEach(function (p) {
      var level = effectivePriority(p);
      if (level === null) out.unconfirmed++;
      else if (out[level] !== undefined) out[level]++;
    });
    return out;
  }

  function byDepartment() {
    return U.groupCount(active(), function (p) { return p.department || 'Unassigned'; });
  }

  function byStatus() {
    var out = {};
    Object.keys(cfg.STATUSES).forEach(function (key) { out[key] = 0; });
    state.patients.forEach(function (p) { out[p.status] = (out[p.status] || 0) + 1; });
    return out;
  }

  function recent(limit) {
    return state.patients.slice().sort(function (a, b) {
      return (U.toDate(b.registeredAt) || 0) - (U.toDate(a.registeredAt) || 0);
    }).slice(0, limit || 6);
  }

  /** Measured (not estimated) waiting duration in minutes for one patient. */
  function measuredWaitMinutes(patient) {
    if (!patient) return 0;
    var start = patient.registeredAt;
    if (patient.seenAt) return U.minutesBetween(start, patient.seenAt);
    if (patient.completedAt) return U.minutesBetween(start, patient.completedAt);
    return U.minutesBetween(start);
  }

  /** Average measured wait across patients who have been seen. */
  function averageMeasuredWait(scope) {
    var list = (scope || state.patients).filter(function (p) { return !!p.seenAt; });
    if (!list.length) return 0;
    return Math.round(U.average(list, measuredWaitMinutes));
  }

  /** Completed consultations per hour for a given day, for the throughput chart. */
  function throughputByHour(day) {
    var buckets = [];
    for (var h = 0; h < 24; h++) buckets.push({ hour: h, label: U.pad(h) + ':00', count: 0 });
    state.patients.forEach(function (p) {
      var at = U.toDate(p.seenAt);
      if (!at) return;
      if (day && !U.isSameDay(at, day)) return;
      buckets[at.getHours()].count++;
    });
    return buckets;
  }

  /** Patients waiting longer than the configured threshold (never forgotten). */
  function longWaiters() {
    var threshold = MediFlow.waiting.settings().longWaitMinutes;
    return activeQueue().filter(function (p) {
      return p.status !== 'in_consultation' && U.minutesBetween(p.registeredAt) >= threshold;
    }).sort(function (a, b) {
      return (U.toDate(a.registeredAt) || 0) - (U.toDate(b.registeredAt) || 0);
    });
  }

  /* ---------------------------------------------------------------------
     Mutations
     --------------------------------------------------------------------- */

  /**
   * Register a new patient.
   * `draft` fields: name, age, gender, phone, symptoms, symptomDuration,
   *   conditions, allergies, vitals{}, department, source, redFlags[],
   *   triage (result from MediFlow.triage.assess), confirmedPriority,
   *   overrideReason, staff
   */
  function create(draft) {
    var data = draft || {};
    var validation = validateDraft(data);
    if (!validation.ok) return { ok: false, errors: validation.errors };

    var assessment = data.triage || MediFlow.triage.assess({
      symptoms: data.symptoms,
      symptomDuration: data.symptomDuration,
      age: data.age,
      source: data.source,
      vitals: data.vitals,
      redFlags: data.redFlags
    }, state.settings);

    var confirmed = U.num(data.confirmedPriority, null);
    if (confirmed !== null && !cfg.PRIORITY_LEVELS[confirmed]) confirmed = null;

    var overrideReason = U.clean(data.overrideReason, 300);
    var comparison = MediFlow.triage.compare(assessment.suggestedLevel, confirmed);

    var patient = {
      id: nextPatientId(),
      name: validation.clean.name,
      age: U.num(data.age, null),
      gender: U.clean(data.gender, 20) || '',
      phone: U.clean(data.phone, 24) || '',

      registeredAt: data.registeredAt || U.nowIso(),
      registeredBy: staffSignature(data.staff),

      symptoms: validation.clean.symptoms,
      symptomDuration: U.clean(data.symptomDuration, 60) || '',
      conditions: U.clean(data.conditions, 300) || '',
      allergies: U.clean(data.allergies, 200) || '',
      vitals: cleanVitals(data.vitals),
      redFlags: Array.isArray(data.redFlags) ? data.redFlags.slice() : [],

      department: data.department && cfg.DEPARTMENTS.indexOf(data.department) !== -1 ? data.department : 'Emergency',
      source: data.source === 'emergency' ? 'emergency' : 'outpatient',

      /* --- triage bookkeeping: suggestion and confirmation stay separate --- */
      suggestedPriority: assessment.suggestedLevel,
      suggestedLabel: assessment.suggested.label + ' – ' + assessment.suggested.name,
      suggestedReasons: assessment.reasons,
      suggestedScore: assessment.score,
      suggestedAt: assessment.assessedAt,
      criticalAlert: assessment.criticalAlert,
      requiresStaffReview: assessment.requiresStaffReview,

      confirmedPriority: confirmed,
      confirmedBy: confirmed === null ? null : staffSignature(data.staff),
      confirmedAt: confirmed === null ? null : U.nowIso(),
      overrideReason: comparison.changed ? (overrideReason || 'Not stated') : (overrideReason || null),
      overrideDirection: comparison.changed ? comparison.direction : null,

      status: 'waiting',
      seenAt: null,
      completedAt: null,
      cancelReason: null,

      notes: data.staffNote ? [{ at: U.nowIso(), by: staffSignature(data.staff), text: U.clean(data.staffNote, 400) }] : [],
      history: [],
      demo: data.demo === true
    };

    pushHistory(patient, { type: 'created', to: patient.id, by: patient.registeredBy, note: 'Patient registered (' + cfg.SOURCES[patient.source].label + ').' });
    pushHistory(patient, { type: 'triage_suggested', to: levelName(assessment.suggestedLevel), by: 'MediFlow rules', note: assessment.summary });
    if (patient.criticalAlert) {
      pushHistory(patient, { type: 'critical_alert', to: 'Emergency alert raised', by: 'MediFlow rules', note: 'Critical warning sign reported. Immediate clinical assessment required.' });
    }
    if (confirmed !== null) {
      pushHistory(patient, {
        type: 'priority_confirmed',
        from: levelName(assessment.suggestedLevel),
        to: levelName(confirmed),
        by: patient.confirmedBy,
        note: comparison.changed
          ? 'Priority changed from the suggestion. Reason: ' + patient.overrideReason
          : 'Priority confirmed as suggested by the rules.'
      });
    }

    state.patients.push(patient);
    persist();
    return { ok: true, patient: patient, assessment: assessment, comparison: comparison };
  }

  function cleanVitals(vitals) {
    var out = {};
    Object.keys(cfg.VITALS).forEach(function (key) {
      var value = U.num((vitals || {})[key], null);
      out[key] = value;
    });
    return out;
  }

  /** Generic field patch with validation, used by the patient detail page. */
  function update(id, patch, options) {
    var patient = get(id);
    if (!patient) return { ok: false, errors: { _: 'Patient not found.' } };
    var opts = options || {};
    var data = patch || {};
    var errors = {};

    if (data.name !== undefined) {
      var name = U.clean(data.name, 80);
      if (name.length < 2) errors.name = 'Enter the patient\u2019s full name.';
      else patient.name = name;
    }
    if (data.age !== undefined) {
      var age = U.num(data.age, null);
      if (age === null || age < 0 || age > 120) errors.age = 'Age must be between 0 and 120 years.';
      else patient.age = age;
    }
    if (data.gender !== undefined) patient.gender = U.clean(data.gender, 20);
    if (data.phone !== undefined) {
      if (data.phone && !U.isPhoneLike(data.phone)) errors.phone = 'That phone number looks invalid.';
      else patient.phone = U.clean(data.phone, 24);
    }
    if (data.symptoms !== undefined) {
      var symptoms = U.clean(data.symptoms, 500);
      if (symptoms.length < 3) errors.symptoms = 'The symptom description is too short.';
      else patient.symptoms = symptoms;
    }
    if (data.symptomDuration !== undefined) patient.symptomDuration = U.clean(data.symptomDuration, 60);
    if (data.conditions !== undefined) patient.conditions = U.clean(data.conditions, 300);
    if (data.allergies !== undefined) patient.allergies = U.clean(data.allergies, 200);
    if (data.vitals !== undefined) patient.vitals = cleanVitals(data.vitals);
    if (data.redFlags !== undefined) patient.redFlags = Array.isArray(data.redFlags) ? data.redFlags.slice() : [];
    if (data.source !== undefined && cfg.SOURCES[data.source]) patient.source = data.source;

    if (Object.keys(errors).length) return { ok: false, errors: errors };

    if (data.reassess === true) {
      var assessment = MediFlow.triage.assess({
        symptoms: patient.symptoms,
        symptomDuration: patient.symptomDuration,
        age: patient.age,
        source: patient.source,
        vitals: patient.vitals,
        redFlags: patient.redFlags
      }, state.settings);
      pushHistory(patient, {
        type: 'triage_suggested',
        from: patient.suggestedLabel || null,
        to: levelName(assessment.suggestedLevel),
        by: staffSignature(opts.staff),
        note: 'Assessment re-run after details were updated. ' + assessment.summary
      });
      patient.suggestedPriority = assessment.suggestedLevel;
      patient.suggestedLabel = assessment.suggested.label + ' – ' + assessment.suggested.name;
      patient.suggestedReasons = assessment.reasons;
      patient.suggestedScore = assessment.score;
      patient.suggestedAt = assessment.assessedAt;
      patient.criticalAlert = assessment.criticalAlert;
      patient.requiresStaffReview = assessment.requiresStaffReview;
      persist();
      return { ok: true, patient: patient, assessment: assessment };
    }

    pushHistory(patient, { type: 'details_updated', by: staffSignature(opts.staff), note: opts.note || 'Patient details were updated.' });
    persist();
    return { ok: true, patient: patient };
  }

  /**
   * Confirm or override the triage priority.
   * An override reason is mandatory whenever the staff choice differs from
   * the suggestion (unless opts.force is used by the demo importer).
   */
  function confirmPriority(id, level, options) {
    var patient = get(id);
    if (!patient) return { ok: false, errors: { _: 'Patient not found.' } };
    var opts = options || {};
    var confirmed = U.num(level, null);
    if (confirmed === null || !cfg.PRIORITY_LEVELS[confirmed]) {
      return { ok: false, errors: { priority: 'Choose one of the four priority levels.' } };
    }

    var suggested = U.num(patient.suggestedPriority, null);
    var comparison = MediFlow.triage.compare(suggested, confirmed);
    var overrideReason = U.clean(opts.reason, 300);

    if (comparison.changed && !opts.force && overrideReason.length < 4) {
      return {
        ok: false,
        errors: {
          reason: comparison.lessUrgent
            ? 'Reducing a suggested priority needs a reason. Record why a lower priority is clinically appropriate.'
            : 'Escalating the priority above the suggestion needs a short reason so the record is complete.'
        }
      };
    }

    var by = staffSignature(opts.staff);
    var fromLabel = patient.confirmedPriority === null ? (patient.suggestedLabel + ' (suggestion)') : levelName(patient.confirmedPriority);

    patient.confirmedPriority = confirmed;
    patient.confirmedBy = by;
    patient.confirmedAt = U.nowIso();
    patient.overrideReason = comparison.changed ? (overrideReason || 'Not stated') : null;
    patient.overrideDirection = comparison.changed ? comparison.direction : null;
    patient.requiresStaffReview = false;

    if (comparison.changed) {
      state.meta.dismissedAlerts = (state.meta.dismissedAlerts || []).filter(function (x) { return x !== patient.id; });
    }

    pushHistory(patient, {
      type: comparison.changed ? 'priority_override' : 'priority_confirmed',
      from: fromLabel,
      to: levelName(confirmed),
      by: by,
      note: comparison.changed
        ? 'Staff set ' + levelName(confirmed) + ' instead of the suggested ' + levelName(suggested) + '. Reason: ' + patient.overrideReason
        : 'Staff confirmed the suggested priority.'
    });

    persist();
    return { ok: true, patient: patient, comparison: comparison };
  }

  var ALLOWED_TRANSITIONS = {
    waiting: ['waiting', 'in_consultation', 'reassessment', 'completed', 'cancelled'],
    reassessment: ['reassessment', 'waiting', 'in_consultation', 'completed', 'cancelled'],
    in_consultation: ['in_consultation', 'completed', 'reassessment', 'cancelled'],
    completed: ['completed', 'waiting'],
    cancelled: ['cancelled', 'waiting']
  };

  /** Is a status change allowed? Used by the UI to disable impossible actions. */
  function canTransition(from, to) {
    var allowed = ALLOWED_TRANSITIONS[from] || [];
    return allowed.indexOf(to) !== -1;
  }

  function setStatus(id, status, options) {
    var patient = get(id);
    if (!patient) return { ok: false, errors: { _: 'Patient not found.' } };
    if (!cfg.STATUSES[status]) return { ok: false, errors: { status: 'Unknown status.' } };

    var allowed = ALLOWED_TRANSITIONS[patient.status] || [];
    if (allowed.indexOf(status) === -1) {
      return {
        ok: false,
        errors: { status: 'A patient cannot move from "' + statusName(patient.status) + '" to "' + statusName(status) + '" directly.' }
      };
    }
    if (status === patient.status) {
      return { ok: true, patient: patient, unchanged: true };
    }
    if (patient.confirmedPriority === null && status !== 'cancelled' && status !== 'reassessment') {
      return {
        ok: false,
        errors: { status: 'Confirm this patient\u2019s triage priority before moving them into the queue.' }
      };
    }

    var opts = options || {};
    var by = staffSignature(opts.staff);
    var from = patient.status;
    var note = U.clean(opts.note, 300);

    patient.status = status;
    if (status === 'in_consultation' && !patient.seenAt) patient.seenAt = U.nowIso();
    if (status === 'completed') {
      patient.completedAt = U.nowIso();
      if (!patient.seenAt) patient.seenAt = patient.completedAt;
    }
    if (status === 'waiting' && from === 'completed') patient.completedAt = null;

    if (note) patient.notes.push({ at: U.nowIso(), by: by, text: note });

    pushHistory(patient, {
      type: 'status_changed',
      from: statusName(from),
      to: statusName(status),
      by: by,
      note: note || (cfg.STATUSES[status] ? cfg.STATUSES[status].description : '')
    });

    persist();
    return { ok: true, patient: patient };
  }

  function assignDepartment(id, department, options) {
    var patient = get(id);
    if (!patient) return { ok: false, errors: { _: 'Patient not found.' } };
    if (cfg.DEPARTMENTS.indexOf(department) === -1) return { ok: false, errors: { department: 'Choose a department from the list.' } };
    if (patient.department === department) return { ok: true, patient: patient, unchanged: true };

    var from = patient.department;
    patient.department = department;
    pushHistory(patient, {
      type: 'department_changed',
      from: from,
      to: department,
      by: staffSignature((options || {}).staff),
      note: U.clean((options || {}).note, 300) || 'Department assignment changed.'
    });
    persist();
    return { ok: true, patient: patient };
  }

  function addNote(id, text, options) {
    var patient = get(id);
    if (!patient) return { ok: false, errors: { _: 'Patient not found.' } };
    var note = U.clean(text, 400);
    if (note.length < 2) return { ok: false, errors: { note: 'Write a short note before saving.' } };
    var by = staffSignature((options || {}).staff);
    patient.notes.push({ at: U.nowIso(), by: by, text: note });
    pushHistory(patient, { type: 'note_added', by: by, note: note });
    persist();
    return { ok: true, patient: patient };
  }

  function cancel(id, options) {
    var patient = get(id);
    if (!patient) return { ok: false, errors: { _: 'Patient not found.' } };
    var opts = options || {};
    var reason = U.clean(opts.reason, 300);
    if (reason.length < 4) {
      return { ok: false, errors: { reason: 'Record why this registration is being cancelled (for example "duplicate registration").' } };
    }
    var by = staffSignature(opts.staff);
    patient.status = 'cancelled';
    patient.cancelReason = reason;
    pushHistory(patient, { type: 'cancelled', from: statusName('waiting'), to: statusName('cancelled'), by: by, note: reason });
    persist();
    return { ok: true, patient: patient };
  }

  function markReassessment(id, options) {
    var opts = U.merge(options || {}, {});
    return setStatus(id, 'reassessment', opts);
  }

  /* ---------------------------------------------------------------------
     Bulk operations (demo data & data management)
     --------------------------------------------------------------------- */

  function addDemoPatients(list) {
    var added = [];
    (list || []).forEach(function (draft) {
      var result = create(U.merge(draft, { demo: true }));
      if (result.ok) {
        /* Demo records are imported already triaged when a confirmed level
           was supplied, so replicate that state without extra confirmations. */
        if (draft.confirmedPriority) {
          confirmPriority(result.patient.id, draft.confirmedPriority, {
            staff: 'Demo import',
            reason: draft.overrideReason || 'Imported demo record with a pre-confirmed priority.',
            force: true
          });
        }
        if (draft.status && draft.status !== 'waiting') {
          var target = draft.status;
          if (target === 'in_consultation' || target === 'completed' || target === 'reassessment') {
            setStatus(result.patient.id, 'in_consultation', { staff: 'Demo import', note: 'Demo record prepared for the presentation.' });
            if (target !== 'in_consultation') {
              setStatus(result.patient.id, target, { staff: 'Demo import', note: 'Demo record prepared for the presentation.' });
            }
          }
        }
        added.push(result.patient);
      }
    });
    state.meta.demoLoaded = true;
    persist();
    return { ok: true, added: added };
  }

  function removeMany(ids) {
    var set = {};
    (ids || []).forEach(function (id) { set[id] = true; });
    var before = state.patients.length;
    state.patients = state.patients.filter(function (p) { return !set[p.id]; });
    persist();
    return { ok: true, removed: before - state.patients.length };
  }

  function clearDemo() {
    var ids = state.patients.filter(function (p) { return p.demo; }).map(function (p) { return p.id; });
    var result = removeMany(ids);
    if (!state.patients.some(function (p) { return p.demo; })) state.meta.demoLoaded = false;
    persist();
    return result;
  }

  function clearAll() {
    state.patients = [];
    state.sequences.patient = cfg.APP.idStart;
    state.meta.dismissedAlerts = [];
    state.meta.demoLoaded = false;
    persist();
    return { ok: true };
  }

  function resetToEmpty() { return clearAll(); }

  function updateSettings(patch) {
    var next = U.deepMerge(state.settings, patch || {});
    var errors = {};

    var rooms = U.num(next.consultRooms, null);
    if (rooms === null || rooms < 1 || rooms > 50) errors.consultRooms = 'Consultation rooms must be between 1 and 50.';
    else next.consultRooms = Math.round(rooms);

    Object.keys(cfg.PRIORITY_LEVELS).forEach(function (level) {
      var value = U.num((next.serviceMinutes || {})[level], null);
      if (value === null || value < 1 || value > 600) errors['service_' + level] = 'Service time for ' + cfg.PRIORITY_LEVELS[level].label + ' must be between 1 and 600 minutes.';
      else next.serviceMinutes[level] = Math.round(value);
    });

    var spread = U.num(next.waitSpreadPercent, null);
    if (spread === null || spread < 0 || spread > 90) errors.waitSpreadPercent = 'The estimate spread must be between 0 and 90%.';

    var roundTo = U.num(next.waitRoundMinutes, null);
    if (roundTo === null || roundTo < 1 || roundTo > 60) errors.waitRoundMinutes = 'Rounding must be between 1 and 60 minutes.';

    var threshold = U.num(next.longWaitThresholdMinutes, null);
    if (threshold === null || threshold < 5 || threshold > 1440) errors.longWaitThresholdMinutes = 'The long-wait threshold must be between 5 and 1440 minutes.';

    if (Array.isArray(next.redFlags)) {
      next.redFlags = next.redFlags.filter(function (flag) { return flag && flag.id && flag.label && Array.isArray(flag.keywords); });
      if (!next.redFlags.length) errors.redFlags = 'Keep at least one warning sign in the list.';
    }

    if (Object.keys(errors).length) return { ok: false, errors: errors };
    state.settings = next;
    persist();
    return { ok: true, settings: state.settings };
  }

  function resetSettings() {
    state.settings = U.clone(cfg.DEFAULT_SETTINGS);
    persist();
    return { ok: true, settings: state.settings };
  }

  function exportJson() {
    return JSON.stringify(state, null, 2);
  }

  function importJson(text, options) {
    var opts = options || {};
    var parsed = MediFlow.storage.restore(text);
    if (!parsed.ok) return parsed;
    var incoming = parsed.state;
    if (opts.mode === 'replace') {
      state = normalise(incoming);
    } else {
      /* Merge: keep existing patients, append unknown IDs. */
      var existing = {};
      state.patients.forEach(function (p) { existing[p.id] = true; });
      var added = 0;
      (incoming.patients || []).forEach(function (p) {
        if (!existing[p.id]) { state.patients.push(p); existing[p.id] = true; added++; }
      });
      if (incoming.settings && opts.mode === 'mergeSettings') state.settings = U.deepMerge(state.settings, incoming.settings);
      parsed.added = added;
    }
    persist();
    return { ok: true, state: state };
  }

  function snapshot() {
    return U.clone(state);
  }

  function lastChange() { return lastChangeAt; }

  return {
    init: init,
    subscribe: subscribe,
    emit: emit,
    snapshot: snapshot,
    lastChange: lastChange,

    get state() { return state; },
    get settings() { return state ? state.settings : null; },

    /* queries */
    all: all,
    get: get,
    isActive: isActive,
    active: active,
    activeQueue: activeQueue,
    pendingTriage: pendingTriage,
    criticalAlerts: criticalAlerts,
    dismissAlert: dismissAlert,
    counts: counts,
    stats: stats,
    byLevel: byLevel,
    byDepartment: byDepartment,
    byStatus: byStatus,
    recent: recent,
    effectivePriority: effectivePriority,
    measuredWaitMinutes: measuredWaitMinutes,
    averageMeasuredWait: averageMeasuredWait,
    throughputByHour: throughputByHour,
    longWaiters: longWaiters,
    levelName: levelName,
    statusName: statusName,

    /* mutations */
    validateDraft: validateDraft,
    create: create,
    update: update,
    confirmPriority: confirmPriority,
    setStatus: setStatus,
    canTransition: canTransition,
    assignDepartment: assignDepartment,
    addNote: addNote,
    cancel: cancel,
    markReassessment: markReassessment,

    /* bulk */
    addDemoPatients: addDemoPatients,
    removeMany: removeMany,
    clearDemo: clearDemo,
    clearAll: clearAll,
    resetToEmpty: resetToEmpty,
    updateSettings: updateSettings,
    resetSettings: resetSettings,
    exportJson: exportJson,
    importJson: importJson
  };
})();
