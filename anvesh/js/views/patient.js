/* ==========================================================================
   MediFlow | js/views/patient.js
   --------------------------------------------------------------------------
   Patient details and the healthcare staff control panel.

   Every control on this page is functional and every important action is
   confirmed first. Status changes that are not possible from the current
   state are disabled with an explanation rather than silently failing.
   ========================================================================== */

window.MediFlow = window.MediFlow || {};
MediFlow.views = MediFlow.views || {};

MediFlow.views.patient = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;
  var ui = MediFlow.ui;
  var shared = MediFlow.views.shared;

  var meta = {
    name: 'patient',
    title: 'Patient Details',
    subtitle: 'Full record, triage decision and staff controls'
  };

  function render(params) {
    var store = MediFlow.store;
    var patient = store.get(params && params.id);

    if (!patient) {
      return shared.pageHead({
        icon: 'i-user',
        title: 'Patient not found',
        subtitle: 'The record you asked for does not exist in this browser.',
        tools: '<a class="btn" href="#/queue">' + U.icon('i-queue') + 'Back to the live queue</a>'
      }) +
      '<div class="card"><div class="card-body">' +
      ui.empty('i-search', 'No patient with that ID',
        'The patient ID in the address may have been mistyped, or the record may have been deleted with the demo data.',
        '<a class="btn" href="#/queue">' + U.icon('i-queue') + 'Go to the live queue</a>' +
        '<a class="btn btn--secondary" href="#/register">' + U.icon('i-user-plus') + 'Register a patient</a>') +
      '</div></div>';
    }

    var queue = store.activeQueue();
    var position = 0;
    queue.forEach(function (item, index) { if (item.id === patient.id) position = index + 1; });
    var level = U.num(patient.confirmedPriority, patient.suggestedPriority);
    var info = level ? cfg.PRIORITY_LEVELS[level] : null;

    var html = '';

    /* ------------------------------ header ---------------------------- */
    html += '<div class="flex-between mb-2">' +
      '<div class="flex" style="gap:12px">' +
        '<a class="btn btn--secondary btn--sm" href="#/queue">' + U.icon('i-back') + 'Queue</a>' +
        '<span class="avatar">' + U.esc(U.initials(patient.name)) + '</span>' +
        '<div>' +
          '<h2 style="font-size:1.25rem">' + U.esc(patient.name) + '</h2>' +
          '<div class="chip-row mt-1">' +
            '<span class="pid">' + U.esc(patient.id) + '</span>' +
            ui.statusBadge(patient.status) +
            (level ? ui.priorityBadge(level, { long: true }) : ui.priorityBadge(null)) +
            ui.sourceBadge(patient.source) +
            ui.demoBadge(patient.demo) +
            ui.reviewBadge(patient) +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<button class="btn btn--secondary btn--sm" data-action="edit-details" data-id="' + U.attr(patient.id) + '">' + U.icon('i-edit', 'ico--sm') + 'Edit details</button>' +
        '<button class="btn btn--secondary btn--sm" data-action="department" data-id="' + U.attr(patient.id) + '">' + U.icon('i-pin', 'ico--sm') + 'Department</button>' +
        '<button class="btn btn--secondary btn--sm" data-action="note" data-id="' + U.attr(patient.id) + '">' + U.icon('i-note', 'ico--sm') + 'Add note</button>' +
        '<button class="btn btn--sm" data-action="priority" data-id="' + U.attr(patient.id) + '">' + U.icon('i-triage', 'ico--sm') + (U.num(patient.confirmedPriority, null) === null ? 'Confirm priority' : 'Change priority') + '</button>' +
        (patient.status !== 'cancelled'
          ? '<button class="btn btn--danger btn--sm" data-action="cancel" data-id="' + U.attr(patient.id) + '">' + U.icon('i-trash', 'ico--sm') + 'Cancel</button>'
          : '') +
      '</div></div>';

    /* --------------------------- alert banners ------------------------ */
    if (patient.criticalAlert || U.num(patient.confirmedPriority, null) === 1) {
      html += '<div class="emergency-alert mb-2">' +
        '<span class="emergency-alert__icon">' + U.icon('i-alert') + '</span>' +
        '<div class="emergency-alert__body">' +
          '<h2>Emergency alert — Level 1 Critical</h2>' +
          '<p>A critical warning sign was reported for this patient. Seek immediate clinical assessment. Do not wait for registration to be completed.</p>' +
          (patient.redFlags && patient.redFlags.length
            ? '<ul>' + patient.redFlags.map(function (flagId) {
                var flag = cfg.RED_FLAG_BY_ID[flagId] || (cfg.DEFAULT_SETTINGS.redFlags.filter(function (f) { return f.id === flagId; })[0]);
                return '<li>• ' + U.esc(flag ? flag.label : flagId) + '</li>';
              }).join('') + '</ul>'
            : '') +
          '<div class="emergency-alert__actions">' +
            '<button class="btn btn--teal" data-action="start" data-id="' + U.attr(patient.id) + '">' + U.icon('i-play') + 'Start consultation</button>' +
            '<button class="btn btn--secondary" data-action="dismiss-alert" data-id="' + U.attr(patient.id) + '">' + U.icon('i-check') + 'Acknowledge alert</button>' +
          '</div>' +
        '</div></div>';
    }

    if (patient.requiresStaffReview) {
      html += '<div class="alert alert--warn mb-2">' + U.icon('i-eye') +
        '<div><strong>Staff review requested by MediFlow</strong>' +
        '<p>Either vital signs are missing, an observation is outside the usual range, or the reported symptoms are too brief to support a lower priority. Please record observations or confirm the priority explicitly.</p></div></div>';
    }

    if (patient.status === 'cancelled') {
      html += '<div class="alert alert--danger mb-2">' + U.icon('i-ban') +
        '<div><strong>This registration was cancelled</strong><p>Reason recorded: ' + U.esc(patient.cancelReason || 'not stated') + '</p></div></div>';
    }

    /* ------------------------- status control panel ------------------- */
    html += statusPanel(patient);

    /* ------------------------------ columns --------------------------- */
    html += '<div class="grid grid--sidebar-right mt-2">';

    /* LEFT */
    html += '<div class="stack">';

    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-user') + 'Patient record</h3>' +
      '<div class="card-head-tools">' + (info ? '<span class="badge badge--p' + info.level + '">' + U.esc(info.label + ' · ' + info.name) + '</span>' : '') + '</div></div>' +
      '<div class="card-body">' +
      '<dl class="dl">' +
        '<dt>Patient ID</dt><dd>' + U.esc(patient.id) + '</dd>' +
        '<dt>Full name</dt><dd>' + U.esc(patient.name) + '</dd>' +
        '<dt>Age</dt><dd>' + U.esc(String(patient.age)) + ' years (' + U.esc(U.ageBand(patient.age)) + ')</dd>' +
        '<dt>Gender</dt><dd>' + U.esc(patient.gender || 'Not stated') + '</dd>' +
        '<dt>Phone</dt><dd>' + U.esc(patient.phone || 'Not provided') + '</dd>' +
        '<dt>Registration source</dt><dd>' + U.esc(cfg.SOURCES[patient.source].label) + '</dd>' +
        '<dt>Department</dt><dd>' + U.esc(patient.department) + '</dd>' +
        '<dt>Registered at</dt><dd>' + U.esc(U.dateTimeLabel(patient.registeredAt)) + ' <span class="muted small">(' + U.esc(U.relativeLabel(patient.registeredAt)) + ')</span></dd>' +
        '<dt>Registered by</dt><dd>' + U.esc(patient.registeredBy || 'Not recorded') + '</dd>' +
        '<dt>Total time in flow</dt><dd>' + U.esc(U.durationLabel(patient.registeredAt)) + (patient.status === 'completed' ? ' (completed)' : '') + '</dd>' +
        (patient.seenAt ? '<dt>First seen by clinician</dt><dd>' + U.esc(U.dateTimeLabel(patient.seenAt)) + ' <span class="muted small">(waited ' + Math.round(store.measuredWaitMinutes(patient)) + ' min)</span></dd>' : '') +
      '</dl>' +
      '<div class="divider"></div>' +
      '<dl class="dl">' +
        '<dt>Medical conditions</dt><dd>' + (patient.conditions ? U.esc(patient.conditions) : '<span class="muted">None recorded</span>') + '</dd>' +
        '<dt>Allergies</dt><dd>' + (patient.allergies ? U.esc(patient.allergies) : '<span class="muted">None recorded</span>') + '</dd>' +
      '</dl>' +
      '</div></div>';

    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-note') + 'Reported symptoms</h3></div>' +
      '<div class="card-body">' +
      '<p style="white-space:pre-wrap">' + U.esc(patient.symptoms) + '</p>' +
      '<div class="chip-row mt-2">' +
        '<span class="chip">' + U.icon('i-clock') + 'Duration: ' + U.esc(patient.symptomDuration || 'not recorded') + '</span>' +
        '<span class="chip">' + U.icon('i-pin') + U.esc(patient.department) + '</span>' +
      '</div>' +
      (patient.redFlags && patient.redFlags.length
        ? '<div class="alert alert--danger mt-2">' + U.icon('i-alert') +
          '<div><strong>Warning signs reported</strong><ul>' + patient.redFlags.map(function (flagId) {
            var flag = cfg.RED_FLAG_BY_ID[flagId] || cfg.DEFAULT_SETTINGS.redFlags.filter(function (f) { return f.id === flagId; })[0];
            return '<li>' + U.esc(flag ? flag.label : flagId) + '</li>';
          }).join('') + '</ul></div></div>'
        : '') +
      '</div></div>';

    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-thermometer') + 'Vital signs</h3>' +
      '<div class="card-head-tools"><button class="btn btn--secondary btn--sm" data-action="edit-details" data-id="' + U.attr(patient.id) + '">' + U.icon('i-edit', 'ico--sm') + 'Update vitals</button></div></div>' +
      '<div class="card-body">' + shared.vitalsGrid(patient) + '</div></div>';

    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-note') + 'Staff notes</h3>' +
      '<div class="card-head-tools"><button class="btn btn--secondary btn--sm" data-action="note" data-id="' + U.attr(patient.id) + '">' + U.icon('i-plus', 'ico--sm') + 'Add note</button></div></div>' +
      '<div class="card-body">' + shared.notesList(patient) + '</div></div>';

    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-history') + 'Status &amp; priority history</h3>' +
      '<div class="card-head-tools"><span class="badge badge--neutral">' + (patient.history || []).length + ' entries</span></div></div>' +
      '<div class="card-body">' + shared.historyTimeline(patient) + '</div></div>';

    html += '</div>';  /* end LEFT */

    /* RIGHT */
    html += '<div class="stack">';

    if (position && patient.status !== 'in_consultation') {
      html += '<div class="card"><div class="card-body">' +
        '<h3 class="section-title">' + U.icon('i-queue') + 'Queue position</h3>' +
        '<p class="stat-value" style="font-size:1.6rem">#' + position + '</p>' +
        '<p class="small muted">' + (position - 1) + ' patient(s) ahead of this patient in the confirmed priority order.</p>' +
        '</div></div>';
    }

    html += shared.assessmentPanel(patient, null);
    html += shared.waitEstimateBox(patient);

    html += '</div>';  /* end RIGHT */
    html += '</div>';

    return html;
  }

  /* ---------------------------------------------------------------------
     Status control panel
     --------------------------------------------------------------------- */

  function statusButton(patient, status, label, icon, className) {
    var allowed = MediFlow.store.canTransition(patient.status, status);
    var isCurrent = patient.status === status;
    var needsPriority = U.num(patient.confirmedPriority, null) === null && status !== 'reassessment';
    var disabled = isCurrent || !allowed || needsPriority;
    var title = isCurrent ? 'This patient is already ' + cfg.STATUSES[status].label + '.'
      : !allowed ? 'A patient cannot move from ' + cfg.STATUSES[patient.status].label + ' to ' + cfg.STATUSES[status].label + ' directly.'
        : needsPriority ? 'Confirm the triage priority first.'
          : cfg.STATUSES[status].description;
    return '<button class="btn ' + (className || 'btn--secondary') + (disabled ? ' is-disabled' : '') + '"' +
      (disabled ? ' disabled aria-disabled="true"' : ' data-action="' + statusAction(status) + '" data-id="' + U.attr(patient.id) + '"') +
      ' title="' + U.attr(title) + '">' + U.icon(icon, 'ico--sm') + U.esc(label) + '</button>';
  }

  function statusAction(status) {
    return status === 'waiting' ? 'resume'
      : status === 'in_consultation' ? 'start'
        : status === 'completed' ? 'complete'
          : 'reassess';
  }

  function statusPanel(patient) {
    return '<div class="card"><div class="card-head"><h3>' + U.icon('i-stethoscope') + 'Staff controls</h3>' +
      '<div class="card-head-tools">' +
        '<span class="small muted">Current status: ' + U.esc(cfg.STATUSES[patient.status].label) + '</span>' +
        '<span class="badge badge--' + cfg.STATUSES[patient.status].tone + '">' + U.icon(cfg.STATUSES[patient.status].icon) + U.esc(cfg.STATUSES[patient.status].label) + '</span>' +
      '</div></div>' +
      '<div class="card-body"><div class="btn-row">' +
        statusButton(patient, 'waiting', 'Mark as Waiting', 'i-clock', 'btn--secondary') +
        statusButton(patient, 'in_consultation', 'Mark as In Consultation', 'i-play', 'btn--teal') +
        statusButton(patient, 'reassessment', 'Reassessment Required', 'i-refresh', 'btn--warn') +
        statusButton(patient, 'completed', 'Mark as Completed', 'i-check-circle', 'btn') +
        '<button class="btn btn--secondary" data-action="priority" data-id="' + U.attr(patient.id) + '">' + U.icon('i-triage', 'ico--sm') + 'Confirm / change priority</button>' +
        '<button class="btn btn--secondary" data-action="department" data-id="' + U.attr(patient.id) + '">' + U.icon('i-pin', 'ico--sm') + 'Assign department</button>' +
        '<button class="btn btn--secondary" data-action="note" data-id="' + U.attr(patient.id) + '">' + U.icon('i-note', 'ico--sm') + 'Record note</button>' +
      '</div>' +
      '<p class="small muted mt-1">Disabled buttons mean that move is not valid from the current status, or that the triage priority still has to be confirmed. Nothing happens silently.</p>' +
      '</div></div>';
  }

  /* ---------------------------------------------------------------------
     Edit details
     --------------------------------------------------------------------- */

  function openEditDialog(patient) {
    var vitals = patient.vitals || {};
    function vitalValue(key) { return vitals[key] === null || vitals[key] === undefined ? '' : String(vitals[key]); }

    ui.dialog({
      title: 'Edit patient details',
      subtitle: patient.id + ' · ' + patient.name,
      icon: 'i-edit',
      size: 'lg',
      message: '<div class="alert alert--info">' + U.icon('i-info') +
        '<div><strong>Changes are recorded in the history</strong><p>Saving can re-run the rule-based assessment so the suggested priority reflects the updated information. The staff-confirmed priority is never changed automatically.</p></div></div>',
      fields: [
        { name: 'name', label: 'Full name', type: 'text', required: true, minLength: 2, value: patient.name },
        { name: 'age', label: 'Age (years)', type: 'number', required: true, min: 0, max: 120, value: patient.age },
        { name: 'gender', label: 'Gender', type: 'select', value: patient.gender, options: [
          { value: '', label: 'Not stated' }, { value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' },
          { value: 'Other', label: 'Other' }, { value: 'Prefer not to say', label: 'Prefer not to say' }
        ] },
        { name: 'phone', label: 'Phone number', type: 'text', value: patient.phone },
        { name: 'symptoms', label: 'Reported symptoms', type: 'textarea', rows: 3, required: true, minLength: 3, value: patient.symptoms },
        { name: 'symptomDuration', label: 'Symptom duration', type: 'text', value: patient.symptomDuration },
        { name: 'conditions', label: 'Relevant medical conditions', type: 'textarea', rows: 2, value: patient.conditions },
        { name: 'allergies', label: 'Allergies', type: 'textarea', rows: 2, value: patient.allergies },
        { name: 'temperature', label: 'Temperature (°C)', type: 'number', step: 0.1, min: cfg.VITALS.temperature.min, max: cfg.VITALS.temperature.max, value: vitalValue('temperature') },
        { name: 'pulse', label: 'Pulse (bpm)', type: 'number', min: cfg.VITALS.pulse.min, max: cfg.VITALS.pulse.max, value: vitalValue('pulse') },
        { name: 'spo2', label: 'Oxygen saturation (%)', type: 'number', min: cfg.VITALS.spo2.min, max: cfg.VITALS.spo2.max, value: vitalValue('spo2') },
        { name: 'systolic', label: 'Systolic BP (mmHg)', type: 'number', min: cfg.VITALS.systolic.min, max: cfg.VITALS.systolic.max, value: vitalValue('systolic') },
        { name: 'diastolic', label: 'Diastolic BP (mmHg)', type: 'number', min: cfg.VITALS.diastolic.min, max: cfg.VITALS.diastolic.max, value: vitalValue('diastolic') },
        { name: 'reassess', label: 'Re-run the assessment', type: 'check', value: true, checkLabel: 'Re-run the rule-based assessment after saving and store a fresh suggestion.', full: true },
        { name: 'staff', label: 'Edited by', type: 'text', value: shared.currentStaff() }
      ],
      confirmLabel: 'Save changes',
      validate: function (values) {
        var errors = {};
        var systolic = U.num(values.systolic, null);
        var diastolic = U.num(values.diastolic, null);
        if (systolic !== null && diastolic !== null && diastolic >= systolic) {
          errors.diastolic = 'Diastolic pressure should be lower than the systolic reading.';
        }
        if (values.phone && !U.isPhoneLike(values.phone)) errors.phone = 'That phone number looks invalid.';
        return errors;
      }
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.update(patient.id, {
        name: values.name,
        age: values.age,
        gender: values.gender,
        phone: values.phone,
        symptoms: values.symptoms,
        symptomDuration: values.symptomDuration,
        conditions: values.conditions,
        allergies: values.allergies,
        vitals: {
          temperature: values.temperature, pulse: values.pulse, spo2: values.spo2,
          systolic: values.systolic, diastolic: values.diastolic
        },
        reassess: values.reassess === true
      }, { staff: values.staff });

      if (!result.ok) {
        ui.toast.error('Changes not saved', Object.keys(result.errors).map(function (key) { return result.errors[key]; }).join(' '));
        return;
      }
      ui.toast.success('Record updated', patient.id + ' was saved' + (values.reassess ? ' and the assessment was re-run.' : '.'));
      if (result.assessment && result.assessment.criticalAlert) {
        ui.toast.error('EMERGENCY ALERT', 'The updated information includes a critical warning sign. Seek immediate clinical assessment.');
      }
    });
  }

  /* ---------------------------------------------------------------------
     Mount
     --------------------------------------------------------------------- */

  function mount(root, params) {
    shared.bindPatientActions(root);

    /* "edit-details" is handled here because it only exists on this page. */
    U.on(root, 'click', '[data-action="edit-details"]', function (event, button) {
      var patient = MediFlow.store.get(button.getAttribute('data-id'));
      if (patient) openEditDialog(patient);
    });
  }

  function update(root, params) {
    var view = MediFlow.router.renderInto(root, render(params));
    if (view) mount(view, params);
  }

  return { meta: meta, render: render, mount: mount, update: update };
})();
