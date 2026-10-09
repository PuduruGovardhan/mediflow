/* ==========================================================================
   MediFlow | js/views/shared.js
   --------------------------------------------------------------------------
   Everything the pages have in common:
     * HTML fragments (stat cards, queue table, vitals, reasons, timeline)
     * The ONE place where patient actions are performed, so a button behaves
       identically on the Dashboard, the Queue and the Patient page.
   ========================================================================== */

window.MediFlow = window.MediFlow || {};
MediFlow.views = MediFlow.views || {};

MediFlow.views.shared = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;
  var ui = MediFlow.ui;

  /* ---------------------------------------------------------------------
     Small pieces
     --------------------------------------------------------------------- */

  function currentStaff() {
    var settings = (MediFlow.store.state && MediFlow.store.state.settings) || {};
    return U.clean(settings.staffName || cfg.DEFAULT_SETTINGS.staffName, 60);
  }

  function currentRole() {
    var settings = (MediFlow.store.state && MediFlow.store.state.settings) || {};
    return U.clean(settings.staffRole || cfg.DEFAULT_SETTINGS.staffRole, 60);
  }

  function statCard(options) {
    var opts = options || {};
    return '<article class="stat' + (opts.tone ? ' stat--' + opts.tone : '') + (opts.pulse ? ' stat--pulse' : '') + '">' +
      '<div class="stat-top">' +
        '<span class="stat-icon">' + U.icon(opts.icon || 'i-info', 'ico--lg') + '</span>' +
        '<span class="stat-label">' + U.esc(opts.label) + '</span>' +
      '</div>' +
      '<p class="stat-value">' + opts.value + (opts.unit ? ' <small>' + U.esc(opts.unit) + '</small>' : '') + '</p>' +
      (opts.foot ? '<p class="stat-foot">' + opts.foot + '</p>' : '') +
      '</article>';
  }

  function pageHead(options) {
    var opts = options || {};
    return '<div class="page-head">' +
      '<div class="flex-1">' +
        '<h2>' + U.icon(opts.icon || 'i-info') + U.esc(opts.title) + '</h2>' +
        '<p>' + opts.subtitle + '</p>' +
      '</div>' +
      (opts.tools ? '<div class="page-head-tools">' + opts.tools + '</div>' : '') +
      '</div>';
  }

  /** Priority column: confirmed level, plus a note when it differs. */
  function priorityCell(patient) {
    var confirmed = U.num(patient.confirmedPriority, null);
    if (confirmed === null) {
      return '<div class="cell-stack">' + ui.priorityBadge(null) +
        '<span class="xsmall muted">Suggested ' + (U.num(patient.suggestedPriority, null) ? 'L' + patient.suggestedPriority : '—') + '</span></div>';
    }
    var html = ui.priorityBadge(confirmed);
    if (patient.overrideReason && U.num(patient.suggestedPriority, null) !== confirmed) {
      html += ' <span class="badge badge--amber" title="' + U.attr('Staff changed the suggested level. Reason: ' + patient.overrideReason) + '">' +
        U.icon('i-edit') + 'Overridden</span>';
    }
    return html;
  }

  /** Elapsed waiting time (measured, not estimated) as a coloured pill. */
  function waitPill(patient, options) {
    var opts = options || {};
    var minutes = U.minutesBetween(patient.registeredAt, patient.seenAt || patient.completedAt || undefined);
    var settings = MediFlow.waiting.settings();
    var tone = '';
    if (opts.estimate !== false && patient.status !== 'completed' && minutes >= settings.longWaitMinutes) {
      tone = minutes >= settings.longWaitMinutes * 1.5 ? ' countdown-pill--crit' : ' countdown-pill--warn';
    }
    var label = U.durationLabel(patient.registeredAt, patient.seenAt || patient.completedAt || undefined);
    var title = patient.seenAt
      ? 'Waited ' + Math.round(MediFlow.store.measuredWaitMinutes(patient)) + ' min before being seen'
      : 'Waiting since ' + U.dateTimeLabel(patient.registeredAt);
    return '<span class="countdown-pill' + tone + '" title="' + U.attr(title) + '">' +
      U.icon('i-clock', 'ico--sm') + U.esc(label) + '</span>';
  }

  function symptomsCell(patient, opts) {
    var options = opts || {};
    var text = U.clean(patient.symptoms, options.max || 90);
    var suffix = patient.symptoms && patient.symptoms.length > (options.max || 90) ? '…' : '';
    return '<div class="cell-stack">' +
      '<span title="' + U.attr(patient.symptoms) + '">' + U.esc(text + suffix) + '</span>' +
      (patient.symptomDuration ? '<span>Duration: ' + U.esc(patient.symptomDuration) + '</span>' : '') +
      (patient.redFlags && patient.redFlags.length
        ? '<span class="badge badge--red" style="align-self:flex-start">' + U.icon('i-alert') + 'Warning sign reported</span>'
        : '') +
      '</div>';
  }

  /* ---------------------------------------------------------------------
     Queue table
     --------------------------------------------------------------------- */

  /**
   * @param {Array}  patients ordered list
   * @param {Object} options { showPosition, showStatus, emptyText, emptyActions,
   *                           positionOffset, compact }
   */
  function queueTable(patients, options) {
    var opts = options || {};
    if (!patients.length) {
      return ui.empty(opts.emptyIcon || 'i-queue', opts.emptyTitle || 'The queue is empty',
        opts.emptyText || 'No patients match the current filters.', opts.emptyActions);
    }

    var rows = patients.map(function (patient, index) {
      var level = U.num(patient.confirmedPriority, patient.suggestedPriority);
      var position = (opts.positionOffset || 0) + index + 1;
      return '<tr class="row--p' + (level || 4) + (patient.status === 'completed' ? ' row--done' : '') + '">' +
        (opts.showPosition === false ? '' : '<td><span class="queue-position">' + position + '</span></td>') +
        '<td>' +
          '<div class="cell-stack">' +
            '<span class="flex" style="gap:7px;flex-wrap:wrap">' +
              '<span class="pid">' + U.esc(patient.id) + '</span>' +
              ui.demoBadge(patient.demo) +
              ui.reviewBadge(patient) +
            '</span>' +
            '<strong>' + U.esc(patient.name) + '</strong>' +
            '<span>' + U.esc(String(patient.age)) + ' yrs · ' + U.esc(patient.gender || 'not stated') + '</span>' +
          '</div>' +
        '</td>' +
        '<td>' + symptomsCell(patient) + '</td>' +
        '<td>' + priorityCell(patient) + '</td>' +
        '<td class="nowrap">' + waitPill(patient) + '</td>' +
        '<td>' + U.esc(patient.department) + '</td>' +
        (opts.showStatus === false ? '' : '<td>' + ui.statusBadge(patient.status) + '</td>') +
        '<td class="nowrap"><div class="cell-actions">' +
          '<button class="btn btn--secondary btn--sm" data-action="open" data-id="' + U.attr(patient.id) + '">' +
            U.icon('i-eye', 'ico--sm') + 'Open</button>' +
          (patient.status === 'waiting'
            ? '<button class="btn btn--teal btn--sm" data-action="start" data-id="' + U.attr(patient.id) + '" title="Move to consultation">' +
                U.icon('i-play', 'ico--sm') + 'Start</button>'
            : patient.status === 'in_consultation'
              ? '<button class="btn btn--sm" data-action="complete" data-id="' + U.attr(patient.id) + '" title="Finish consultation">' +
                  U.icon('i-check', 'ico--sm') + 'Complete</button>'
              : '') +
        '</div></td>' +
        '</tr>';
    }).join('');

    return '<div class="table-wrap"><table class="data">' +
      '<caption>' + U.esc(opts.caption || 'Ordered by staff-confirmed urgency, then earliest registration.') + '</caption>' +
      '<thead><tr>' +
        (opts.showPosition === false ? '' : '<th scope="col">#</th>') +
        '<th scope="col">Patient</th>' +
        '<th scope="col">Reported symptoms</th>' +
        '<th scope="col">Priority</th>' +
        '<th scope="col">Waiting</th>' +
        '<th scope="col">Department</th>' +
        (opts.showStatus === false ? '' : '<th scope="col">Status</th>') +
        '<th scope="col" class="right">Actions</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }

  /* ---------------------------------------------------------------------
     Assessment fragments
     --------------------------------------------------------------------- */

  function reasonList(reasons) {
    if (!reasons || !reasons.length) {
      return '<p class="muted small">No specific rules were triggered by the information provided.</p>';
    }
    return '<div class="reason-list">' + reasons.map(function (item) {
      var cls = item.kind === 'critical' ? 'reason--critical'
        : item.kind === 'vital' ? 'reason--vital'
          : item.kind === 'symptom' ? 'reason--symptom'
            : item.kind === 'review' ? 'reason--review' : 'reason--neutral';
      return '<div class="reason ' + cls + '">' +
        U.icon(item.kind === 'critical' ? 'i-alert' : item.kind === 'vital' ? 'i-pulse' : item.kind === 'review' ? 'i-eye' : 'i-info', 'ico--sm') +
        '<span>' + U.esc(item.text) +
        (item.points ? ' <span class="muted xsmall">(' + (item.points > 0 ? '+' : '') + item.points + ')</span>' : '') +
        '</span></div>';
    }).join('') + '</div>';
  }

  /**
   * The triage panel used on the Register page, the Triage page and the
   * Patient page. Always shows: the suggestion, its reasons, and how it was
   * confirmed or overridden.
   */
  function assessmentPanel(patient, assessment) {
    var suggestedLevel = assessment ? assessment.suggestedLevel : U.num(patient.suggestedPriority, 4);
    var info = cfg.PRIORITY_LEVELS[suggestedLevel] || cfg.PRIORITY_LEVELS[4];
    var reasons = assessment ? assessment.reasons : (patient.suggestedReasons || []);
    var confirmed = U.num(patient.confirmedPriority, null);
    var changed = confirmed !== null && confirmed !== suggestedLevel;

    var header = '<div class="assessment-head">' +
      '<span class="level-pill level-pill--p' + suggestedLevel + '">Provisional ' + U.esc(info.label) + ' · ' + U.esc(info.name) + '</span>' +
      '<div class="flex-1">' +
        '<strong>' + U.esc(assessment ? assessment.summary : (patient.suggestedLabel || 'Rule-based suggestion')) + '</strong>' +
        '<p class="small muted">Basis: ' + U.esc(assessment ? assessment.basis : 'rule-based scoring') +
        (assessment ? ' · combined score ' + assessment.score : '') + '</p>' +
      '</div>' +
      '</div>';

    var comparisonRow = '<div class="suggested-vs-confirmed">' +
      '<div class="svc-box"><dt>MediFlow suggested</dt><dd>' + ui.priorityBadge(suggestedLevel, { long: true }) + '</dd></div>' +
      '<span class="svc-arrow">' + U.icon('i-chevron-right', 'ico--lg') + '</span>' +
      '<div class="svc-box"><dt>Staff confirmed</dt><dd>' +
        (confirmed === null ? ui.priorityBadge(null) : ui.priorityBadge(confirmed, { long: true })) +
        (changed ? '<p class="xsmall muted mt-1">Changed by ' + U.esc(patient.confirmedBy || 'staff') + '</p>' : '') +
      '</dd></div>' +
      '</div>';

    var overrideBox = changed
      ? ui.alertBox('warn', 'i-edit', 'Priority was overridden by staff',
          '<p>Reason recorded: ' + U.esc(patient.overrideReason || 'Not stated') + '</p>')
      : confirmed !== null
        ? ui.alertBox('success', 'i-check-circle', 'Confirmed by staff',
            '<p>Confirmed as suggested by ' + U.esc(patient.confirmedBy || 'a staff member') + ' at ' + U.esc(U.timeLabel(patient.confirmedAt)) + '.</p>')
        : ui.alertBox('warn', 'i-warning', 'Awaiting staff confirmation',
            '<p>This provisional level is a suggestion only. A member of staff must confirm or change it before the patient relies on it.</p>');

    return '<div class="assessment-panel">' + header +
      '<div class="assessment-body">' +
        comparisonRow +
        '<div>' +
          '<h4 class="section-title">' + U.icon('i-note') + 'Why MediFlow suggested this level</h4>' +
          reasonList(reasons) +
        '</div>' +
        overrideBox +
        '<div class="alert alert--info">' + U.icon('i-shield') +
          '<div><strong>This is assistance, not a diagnosis</strong><p>' + U.esc((assessment && assessment.disclaimer) || cfg.DISCLAIMERS.triage) + '</p></div>' +
        '</div>' +
      '</div></div>';
  }

  /* ---------------------------------------------------------------------
     Vitals & details
     --------------------------------------------------------------------- */

  function vitalsGrid(patient) {
    var evaluation = MediFlow.triage.evaluateVitals(patient.vitals || {});
    return '<div class="vital-grid">' + Object.keys(cfg.VITALS).map(function (key) {
      var meta = cfg.VITALS[key];
      var item = evaluation.perVital[key];
      var cls = item.state === 'crit' ? ' vital--crit' : item.state === 'warn' ? ' vital--warn' : item.state === 'missing' ? ' vital--missing' : '';
      return '<div class="vital' + cls + '">' +
        '<div class="vital-top">' + U.icon(meta.icon, 'ico--sm') + U.esc(meta.label) + '</div>' +
        '<p class="vital-val">' + (item.state === 'missing'
          ? 'Not recorded'
          : U.esc(String(item.value)) + ' <small>' + U.esc(meta.unit) + '</small>') + '</p>' +
        '</div>';
    }).join('') + '</div>' +
    (evaluation.messages.length
      ? '<div class="alert alert--warn mt-2">' + U.icon('i-warning') +
        '<div><strong>Vital signs needing attention</strong><ul>' +
        evaluation.messages.map(function (message) { return '<li>' + U.esc(message.text) + '</li>'; }).join('') +
        '</ul></div></div>'
      : evaluation.missing
        ? '<div class="alert alert--warn mt-2">' + U.icon('i-warning') +
          '<div><strong>No vital signs recorded</strong><p>Ask clinical staff to record observations. MediFlow will not rely on a low priority classification without them.</p></div></div>'
        : '<div class="alert alert--success mt-2">' + U.icon('i-check-circle') +
          '<div><strong>Vital signs within the usual range</strong><p>Recorded values are inside the ranges MediFlow checks against.</p></div></div>');
  }

  function historyTimeline(patient) {
    if (!patient.history || !patient.history.length) {
      return ui.empty('i-history', 'No history yet', 'Status and priority changes will appear here as staff work with this record.');
    }
    var toneByType = {
      created: '', triage_suggested: 'teal', priority_confirmed: 'green', priority_override: 'amber',
      status_changed: 'teal', department_changed: '', note_added: 'slate',
      critical_alert: 'red', cancelled: 'slate', details_updated: ''
    };
    return '<div class="timeline">' + patient.history.slice().reverse().map(function (entry) {
      return '<div class="tl-item tl-item--' + (toneByType[entry.type] || '') + '">' +
        '<div class="tl-head">' +
          '<strong>' + U.esc(historyTitle(entry)) + '</strong>' +
          '<span class="tl-time">' + U.esc(U.dateTimeLabel(entry.at)) + '</span>' +
          (entry.by ? '<span class="badge badge--neutral">' + U.icon('i-user') + U.esc(entry.by) + '</span>' : '') +
        '</div>' +
        (entry.note ? '<p class="tl-body">' + U.esc(entry.note) + '</p>' : '') +
        (entry.from || entry.to
          ? '<p class="tl-body xsmall muted">' +
            (entry.from ? U.esc(entry.from) : '—') + '  →  ' + (entry.to ? U.esc(entry.to) : '—') + '</p>'
          : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function historyTitle(entry) {
    var titles = {
      created: 'Patient registered',
      triage_suggested: 'Triage suggestion produced',
      priority_confirmed: 'Priority confirmed',
      priority_override: 'Priority changed by staff',
      status_changed: 'Status changed',
      department_changed: 'Department changed',
      note_added: 'Staff note added',
      critical_alert: 'EMERGENCY ALERT raised',
      cancelled: 'Registration cancelled',
      details_updated: 'Patient details updated'
    };
    return titles[entry.type] || entry.type;
  }

  function notesList(patient) {
    if (!patient.notes || !patient.notes.length) {
      return '<p class="muted small">No staff notes recorded yet.</p>';
    }
    return '<div class="note-list">' + patient.notes.slice().reverse().map(function (note) {
      return '<div class="note-item">' +
        '<div class="note-meta">' + U.icon('i-note', 'ico--sm') +
          '<strong>' + U.esc(note.by || 'Staff') + '</strong>' +
          '<span>' + U.esc(U.dateTimeLabel(note.at)) + '</span>' +
        '</div>' +
        '<p>' + U.esc(note.text) + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------------------
     Filtering & sorting helpers
     --------------------------------------------------------------------- */

  function matchesSearch(patient, query) {
    var term = U.clean(query).toLowerCase();
    if (!term) return true;
    return (patient.name || '').toLowerCase().indexOf(term) !== -1 ||
      (patient.id || '').toLowerCase().indexOf(term) !== -1 ||
      (patient.symptoms || '').toLowerCase().indexOf(term) !== -1 ||
      (patient.department || '').toLowerCase().indexOf(term) !== -1;
  }

  function applyFilters(patients, filters) {
    var f = filters || {};
    var list = patients.filter(function (patient) {
      if (!matchesSearch(patient, f.search)) return false;
      if (f.priority) {
        if (f.priority === 'unconfirmed') {
          /* The safety list: registered but no staff decision yet. */
          if (U.num(patient.confirmedPriority, null) !== null) return false;
        } else if (U.num(patient.confirmedPriority, null) !== Number(f.priority)) {
          /* Filtering by a level means the level staff CONFIRMED, because that
             is what the live queue is ordered by. Patients awaiting a decision
             are filtered with the "Awaiting confirmation" option instead, so a
             suggestion can never be mistaken for a decision. */
          return false;
        }
      }
      if (f.department && patient.department !== f.department) return false;
      /* "active" is a sentinel meaning "every patient still in the flow",
         not a patient status – comparing it as a status would empty the list. */
      if (f.status === 'active') {
        if (!MediFlow.store.isActive(patient)) return false;
      } else if (f.status && f.status !== 'everything') {
        if (patient.status !== f.status) return false;
      }
      if (f.source && patient.source !== f.source) return false;
      return true;
    });

    var sort = f.sort || 'urgency';
    if (sort === 'urgency') {
      /* Same rule as the live queue: confirmed urgency, then oldest first. */
      list.sort(function (a, b) {
        return (U.num(a.confirmedPriority, 99) - U.num(b.confirmedPriority, 99)) ||
          ((U.toDate(a.registeredAt) || 0) - (U.toDate(b.registeredAt) || 0));
      });
    } else if (sort === 'wait-longest') {
      list.sort(function (a, b) { return (U.toDate(a.registeredAt) || 0) - (U.toDate(b.registeredAt) || 0); });
    } else if (sort === 'wait-shortest') {
      list.sort(function (a, b) { return (U.toDate(b.registeredAt) || 0) - (U.toDate(a.registeredAt) || 0); });
    } else if (sort === 'name') {
      list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    } else if (sort === 'id') {
      list.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
    }
    return list;
  }

  /* ---------------------------------------------------------------------
     ACTION HANDLERS – the single implementation for every patient button
     --------------------------------------------------------------------- */

  /**
   * Attach delegated handlers for all [data-action] buttons inside `root`.
   * Called by every page, so the behaviour can never drift between pages.
   */
  function bindPatientActions(root) {
    U.on(root, 'click', '[data-action]', function (event, button) {
      var action = button.getAttribute('data-action');
      var id = button.getAttribute('data-id');
      var patient = id ? MediFlow.store.get(id) : null;

      switch (action) {
        case 'open':
          window.location.hash = '#/patient/' + encodeURIComponent(id);
          break;
        case 'priority': if (patient) openPriorityDialog(patient); break;
        case 'start': if (patient) startConsultation(patient); break;
        case 'complete': if (patient) completeConsultation(patient); break;
        case 'reassess': if (patient) flagReassessment(patient); break;
        case 'resume': if (patient) resumeWaiting(patient); break;
        case 'note': if (patient) openNoteDialog(patient); break;
        case 'department': if (patient) openDepartmentDialog(patient); break;
        case 'cancel': if (patient) cancelRegistration(patient); break;
        case 'dismiss-alert':
          MediFlow.store.dismissAlert(id);
          ui.toast.info('Alert acknowledged', 'The emergency alert for ' + id + ' was dismissed. The patient remains flagged as Level 1 in the queue.');
          break;
        default:
          break;
      }
    });
  }

  /* --------------------------- priority ------------------------------- */

  function openPriorityDialog(patient) {
    var suggested = U.num(patient.suggestedPriority, null);
    var current = U.num(patient.confirmedPriority, suggested);
    var summary = '<div class="alert alert--info">' + U.icon('i-triage') +
      '<div><strong>MediFlow suggested ' +
        (suggested ? 'L' + suggested + ' · ' + U.esc(cfg.PRIORITY_LEVELS[suggested].name) : 'no level') +
      '</strong><p>' + U.esc(patient.suggestedLabel || 'No suggestion stored for this record.') + '</p></div></div>' +
      (patient.suggestedReasons && patient.suggestedReasons.length
        ? '<div class="mt-2">' + reasonList(patient.suggestedReasons) + '</div>'
        : '');

    ui.dialog({
      title: 'Confirm or change triage priority',
      subtitle: patient.id + ' · ' + patient.name,
      icon: 'i-triage',
      size: 'lg',
      message: summary,
      fields: [
        { name: 'priority', label: 'Staff-confirmed priority', type: 'priority', required: true, value: current === null ? '' : current },
        {
          name: 'reason',
          label: 'Reason for changing the suggested level',
          type: 'textarea',
          rows: 2,
          placeholder: 'For example: vital signs were repeated and now normal; senior clinician reviewed the patient.',
          help: 'Mandatory whenever your decision differs from the MediFlow suggestion. It is stored separately from the suggestion.'
        },
        { name: 'staff', label: 'Decided by (name / role)', type: 'text', value: currentStaff() || currentRole() }
      ],
      confirmLabel: 'Save priority',
      validate: function (values) {
        var errors = {};
        if (suggested !== null && Number(values.priority) !== suggested && U.clean(values.reason).length < 4) {
          errors.reason = 'Record the reason for choosing a different level from the suggestion (at least 4 characters).';
        }
        return errors;
      }
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.confirmPriority(patient.id, Number(values.priority), {
        staff: values.staff,
        reason: values.reason
      });
      if (!result.ok) {
        ui.toast.error('Priority not saved', Object.keys(result.errors).map(function (key) { return result.errors[key]; }).join(' '));
        return;
      }
      if (result.comparison.changed) {
        ui.toast.warn('Priority changed',
          patient.id + ' set to L' + values.priority + ' instead of the suggested L' + suggested + '. The queue has been reordered.');
      } else {
        ui.toast.success('Priority confirmed', patient.id + ' confirmed at L' + values.priority + ' · ' + cfg.PRIORITY_LEVELS[values.priority].name + '.');
      }
    });
  }

  /* ---------------------------- status -------------------------------- */

  function startConsultation(patient) {
    ui.confirm({
      title: 'Start consultation?',
      subtitle: patient.id + ' · ' + patient.name,
      icon: 'i-play',
      iconTone: 'amber',
      tone: 'teal',
      confirmLabel: 'Start consultation',
      message: '<p>This patient will be marked <strong>In Consultation</strong> and the waiting estimate for everyone behind them will be recalculated.</p>' +
        '<p class="small muted mt-1">The waiting time recorded so far is ' + U.durationLabel(patient.registeredAt) + '.</p>',
      fields: [{ name: 'staff', label: 'Seen by (name / role)', type: 'text', value: currentStaff() }]
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.setStatus(patient.id, 'in_consultation', { staff: values.staff });
      if (!result.ok) { ui.toast.error('Could not update status', Object.values(result.errors).join(' ')); return; }
      ui.toast.success('In consultation', patient.name + ' (' + patient.id + ') moved to In Consultation.');
    });
  }

  function completeConsultation(patient) {
    ui.confirm({
      title: 'Complete this consultation?',
      subtitle: patient.id + ' · ' + patient.name,
      icon: 'i-check-circle',
      iconTone: 'amber',
      confirmLabel: 'Mark as completed',
      message: '<p>The patient will be removed from the live queue and counted in the analytics as a completed consultation.</p>' +
        '<p class="small muted mt-1">Total time since registration: ' + U.durationLabel(patient.registeredAt) + '.</p>',
      fields: [
        { name: 'staff', label: 'Completed by (name / role)', type: 'text', value: currentStaff() },
        { name: 'note', label: 'Closing note (optional)', type: 'textarea', rows: 2, placeholder: 'Outcome, advice given, referral…' }
      ]
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.setStatus(patient.id, 'completed', { staff: values.staff, note: values.note });
      if (!result.ok) { ui.toast.error('Could not complete', Object.values(result.errors).join(' ')); return; }
      ui.toast.success('Consultation completed', patient.name + ' (' + patient.id + ') removed from the live queue.');
    });
  }

  function flagReassessment(patient) {
    ui.confirm({
      title: 'Flag for reassessment?',
      subtitle: patient.id + ' · ' + patient.name,
      icon: 'i-refresh',
      iconTone: 'amber',
      tone: 'warn',
      confirmLabel: 'Flag reassessment',
      message: '<p>The patient stays in the queue but is clearly marked so a clinician re-checks their condition. This is how MediFlow makes sure long-waiting patients are not silently forgotten.</p>',
      fields: [
        {
          name: 'note',
          label: 'What needs re-checking?',
          type: 'textarea',
          rows: 2,
          required: true,
          minLength: 4,
          value: 'Patient has been waiting ' + U.durationLabel(patient.registeredAt) + ' — please reassess condition and priority.'
        },
        { name: 'staff', label: 'Requested by', type: 'text', value: currentStaff() }
      ]
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.setStatus(patient.id, 'reassessment', { staff: values.staff, note: values.note });
      if (!result.ok) { ui.toast.error('Could not flag', Object.values(result.errors).join(' ')); return; }
      ui.toast.warn('Reassessment required', patient.name + ' (' + patient.id + ') is now flagged for clinical reassessment.');
    });
  }

  function resumeWaiting(patient) {
    ui.confirm({
      title: 'Return to the waiting queue?',
      subtitle: patient.id + ' · ' + patient.name,
      icon: 'i-clock',
      confirmLabel: 'Move to waiting',
      message: '<p>The patient will be placed back into the live queue in their confirmed priority band.</p>',
      fields: [{ name: 'staff', label: 'Actioned by', type: 'text', value: currentStaff() }]
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.setStatus(patient.id, 'waiting', { staff: values.staff });
      if (!result.ok) { ui.toast.error('Could not update', Object.values(result.errors).join(' ')); return; }
      ui.toast.success('Status updated', patient.name + ' is waiting again.');
    });
  }

  function openNoteDialog(patient) {
    ui.dialog({
      title: 'Record a staff note',
      subtitle: patient.id + ' · ' + patient.name,
      icon: 'i-note',
      fields: [
        { name: 'text', label: 'Note', type: 'textarea', rows: 3, required: true, minLength: 3, placeholder: 'Brief, factual note for the clinical record…' },
        { name: 'staff', label: 'Written by', type: 'text', value: currentStaff() }
      ],
      confirmLabel: 'Save note'
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.addNote(patient.id, values.text, { staff: values.staff });
      if (!result.ok) { ui.toast.error('Note not saved', Object.values(result.errors).join(' ')); return; }
      ui.toast.success('Note saved', 'The note was added to ' + patient.id + '\u2019s record.');
    });
  }

  function openDepartmentDialog(patient) {
    ui.dialog({
      title: 'Assign department',
      subtitle: patient.id + ' · ' + patient.name,
      icon: 'i-pin',
      fields: [
        {
          name: 'department',
          label: 'Department',
          type: 'select',
          required: true,
          value: patient.department,
          options: cfg.DEPARTMENTS.map(function (name) { return { value: name, label: name }; })
        },
        { name: 'staff', label: 'Changed by', type: 'text', value: currentStaff() }
      ],
      confirmLabel: 'Save department'
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.assignDepartment(patient.id, values.department, { staff: values.staff });
      if (!result.ok) { ui.toast.error('Could not change department', Object.values(result.errors).join(' ')); return; }
      ui.toast.success('Department updated', patient.id + ' is now routed to ' + values.department + '.');
    });
  }

  function cancelRegistration(patient) {
    ui.confirm({
      title: 'Cancel this registration?',
      subtitle: patient.id + ' · ' + patient.name,
      icon: 'i-trash',
      iconTone: 'red',
      tone: 'danger',
      confirmLabel: 'Cancel registration',
      message: '<div class="alert alert--danger">' + U.icon('i-warning') +
        '<div><strong>This removes the patient from the live queue.</strong>' +
        '<p>The record is kept for audit but marked as cancelled. Use this for duplicate or erroneous registrations only.</p></div></div>',
      fields: [
        {
          name: 'reason',
          label: 'Reason for cancelling',
          type: 'text',
          required: true,
          minLength: 4,
          placeholder: 'For example: duplicate registration – the patient is already ' + patient.id
        },
        { name: 'staff', label: 'Cancelled by', type: 'text', value: currentStaff() }
      ]
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.cancel(patient.id, { reason: values.reason, staff: values.staff });
      if (!result.ok) { ui.toast.error('Not cancelled', Object.values(result.errors).join(' ')); return; }
      ui.toast.warn('Registration cancelled', patient.id + ' was removed from the queue with the recorded reason.');
      if (MediFlow.router && MediFlow.router.currentName && MediFlow.router.currentName() === 'patient') {
        window.location.hash = '#/queue';
      }
    });
  }

  /* --------------------------- waiting estimate ------------------------ */

  function waitEstimateBox(patient, options) {
    var opts = options || {};
    if (!MediFlow.waiting.settings().waitEnabled) {
      return ui.alertBox('info', 'i-info', 'Waiting estimates are switched off',
        '<p>An administrator has turned off illustrative waiting estimates in Settings.</p>');
    }
    var queue = MediFlow.store.activeQueue();
    var estimate = MediFlow.waiting.estimate(patient, queue);

    if (!estimate.available) {
      return ui.alertBox('info', 'i-info', 'No estimate available', '<p>' + U.esc(estimate.explanation) + '</p>');
    }

    return '<div class="card card--flush"><div class="card-body">' +
      '<div class="flex-between mb-1">' +
        '<h3 class="section-title" style="margin:0">' + U.icon('i-clock') + 'Estimated wait (illustrative)</h3>' +
        '<span class="badge badge--amber">' + U.icon('i-info') + 'Estimate only</span>' +
      '</div>' +
      '<p class="stat-value" style="font-size:1.6rem">' + U.esc(estimate.display) + '</p>' +
      '<p class="small muted">' + U.esc(estimate.explanation) + '</p>' +
      '<div class="divider"></div>' +
      '<dl class="dl">' +
        '<dt>Position in queue</dt><dd>' + (estimate.position ? '#' + estimate.position : '—') + '</dd>' +
        '<dt>Patients ahead</dt><dd>' + estimate.aheadCount + '</dd>' +
        '<dt>Consultation rooms in use</dt><dd>' + estimate.rooms + '</dd>' +
      '</dl>' +
      '<div class="alert alert--warn mt-2">' + U.icon('i-warning') +
        '<div><strong>Never a guarantee</strong><p>' + U.esc(cfg.DISCLAIMERS.wait) + '</p></div></div>' +
      '</div></div>';
  }

  return {
    currentStaff: currentStaff,
    currentRole: currentRole,
    statCard: statCard,
    pageHead: pageHead,
    priorityCell: priorityCell,
    waitPill: waitPill,
    symptomsCell: symptomsCell,
    queueTable: queueTable,
    reasonList: reasonList,
    assessmentPanel: assessmentPanel,
    vitalsGrid: vitalsGrid,
    historyTimeline: historyTimeline,
    notesList: notesList,
    matchesSearch: matchesSearch,
    applyFilters: applyFilters,
    bindPatientActions: bindPatientActions,
    openPriorityDialog: openPriorityDialog,
    openNoteDialog: openNoteDialog,
    openDepartmentDialog: openDepartmentDialog,
    cancelRegistration: cancelRegistration,
    waitEstimateBox: waitEstimateBox
  };
})();
