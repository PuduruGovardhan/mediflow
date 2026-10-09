/* ==========================================================================
   MediFlow | js/views/register.js
   --------------------------------------------------------------------------
   Patient registration.

   The page is deliberately a single screen with a live triage preview:
     1. Staff enter the patient details, symptoms, warning signs and vitals.
     2. MediFlow recalculates the provisional priority on every keystroke and
        shows the reasons immediately (no hidden processing).
     3. "Review assessment and register" opens a confirmation step where staff
        see the suggestion and confirm or override it. An override always
        requires a reason.
     4. The record is saved and drops into the correctly ordered queue.

   Registration can also be saved WITHOUT a confirmed priority; the record
   then appears in the amber "awaiting triage confirmation" strip, which is
   the safety net that stops patients being forgotten.
   ========================================================================== */

window.MediFlow = window.MediFlow || {};
MediFlow.views = MediFlow.views || {};

MediFlow.views.register = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;
  var ui = MediFlow.ui;
  var shared = MediFlow.views.shared;

  var meta = {
    name: 'register',
    title: 'Register Patient',
    subtitle: 'Registration, warning-sign checklist and provisional triage'
  };

  /* Small builder for a labelled form field with an inline error slot. */
  function field(options) {
    var opts = options || {};
    var label = '<label for="' + opts.id + '">' + U.esc(opts.label) +
      (opts.required ? ' <span class="req" title="Required">*</span>' : '') +
      (opts.optional ? ' <span class="hint-tag">optional</span>' : '') +
      (opts.unit ? ' <span class="unit">(' + U.esc(opts.unit) + ')</span>' : '') +
      '</label>';
    var input = opts.control || '';
    return '<div class="field' + (opts.full ? ' field--full' : '') + '" data-field="' + opts.id + '">' +
      label + input +
      (opts.help ? '<span class="help">' + U.esc(opts.help) + '</span>' : '') +
      '<span class="field-error" data-error="' + opts.id + '"></span>' +
      '</div>';
  }

  function textField(opts) {
    opts.control = '<input id="' + opts.id + '" name="' + opts.id + '" type="' + (opts.type || 'text') + '"' +
      (opts.placeholder ? ' placeholder="' + U.attr(opts.placeholder) + '"' : '') +
      (opts.value !== undefined ? ' value="' + U.attr(opts.value) + '"' : '') +
      (opts.min !== undefined ? ' min="' + opts.min + '"' : '') +
      (opts.max !== undefined ? ' max="' + opts.max + '"' : '') +
      (opts.step !== undefined ? ' step="' + opts.step + '"' : '') + ' />';
    return field(opts);
  }

  function numberField(opts) {
    opts.type = 'number';
    return textField(opts);
  }

  function textareaField(opts) {
    opts.control = '<textarea id="' + opts.id + '" name="' + opts.id + '" rows="' + (opts.rows || 3) + '"' +
      (opts.placeholder ? ' placeholder="' + U.attr(opts.placeholder) + '"' : '') + '>' + U.esc(opts.value || '') + '</textarea>';
    return field(opts);
  }

  function selectField(opts) {
    opts.control = '<select id="' + opts.id + '" name="' + opts.id + '">' +
      (opts.options || []).map(function (option) {
        return '<option value="' + U.attr(option.value) + '"' + (option.value === opts.value ? ' selected' : '') + '>' +
          U.esc(option.label) + '</option>';
      }).join('') + '</select>';
    return field(opts);
  }

  /* --------------------------------------------------------------------- */

  function render() {
    var settings = MediFlow.store.settings;
    var now = new Date();

    var html = shared.pageHead({
      icon: 'i-user-plus',
      title: 'Register a patient',
      subtitle: 'Right Priority. Better Patient Flow. — Enter what the patient reports and what you observe. MediFlow suggests a provisional priority with its reasons; a member of staff always confirms it.',
      tools: '<a class="btn btn--secondary" href="#/queue">' + U.icon('i-queue') + 'Go to live queue</a>'
    });

    html += '<div class="alert alert--warn mb-2">' + U.icon('i-shield') +
      '<div><strong>Never delay emergency care to complete a form</strong>' +
      '<p>If the patient needs immediate attention, act first. Only a name and age are needed to register someone in an emergency — gender, phone number and every other field can be completed later. MediFlow is a hackathon prototype and never replaces clinical judgement.</p></div></div>';

    if (MediFlow.store.pendingTriage().length) {
      html += '<div class="alert alert--info mb-2">' + U.icon('i-triage') +
        '<div><strong>' + MediFlow.store.pendingTriage().length + ' patient(s) are still awaiting a confirmed priority</strong>' +
        '<p>They are listed on the <a href="#/triage">Triage Assessment</a> page and in the amber strip on the dashboard.</p></div></div>';
    }

    html += '<form id="register-form" novalidate><div class="grid grid--sidebar-right">';

    /* ============================ LEFT: the form ===================== */
    html += '<div class="stack">';

    /* --- Identity --------------------------------------------------- */
    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-user') + 'Patient details</h3>' +
      '<div class="card-head-tools"><span class="small muted">Patient ID and registration time are generated automatically</span></div></div>' +
      '<div class="card-body"><div class="form-grid">' +
        textField({ id: 'name', label: 'Full name', required: true, placeholder: 'e.g. Demo Patient P', help: 'Only a name and age are essential in an emergency.' }) +
        numberField({ id: 'age', label: 'Age', required: true, unit: 'years', min: 0, max: 120, step: 1, placeholder: 'e.g. 42' }) +
        selectField({
          id: 'gender', label: 'Gender', optional: true, value: '',
          options: [
            { value: '', label: 'Not stated' },
            { value: 'Female', label: 'Female' },
            { value: 'Male', label: 'Male' },
            { value: 'Other', label: 'Other' },
            { value: 'Prefer not to say', label: 'Prefer not to say' }
          ]
        }) +
        textField({ id: 'phone', label: 'Phone number', optional: true, type: 'tel', placeholder: '+1 555 0100', help: 'Digits, spaces and + ( ) - only.' }) +
        '<div class="field field--full"><label>Registration reference</label>' +
          '<div class="chip-row">' +
            '<span class="chip chip--blue">' + U.icon('i-flag') + 'Next ID: ' + U.esc(cfg.APP.idPrefix + (MediFlow.store.state.sequences.patient)) + '</span>' +
            '<span class="chip">' + U.icon('i-calendar') + U.esc(U.dateTimeLabel(now)) + '</span>' +
            '<span class="chip">' + U.icon('i-user') + 'Registered by ' + U.esc(shared.currentStaff()) + '</span>' +
          '</div></div>' +
      '</div></div></div>';

    /* --- Presentation ----------------------------------------------- */
    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-pin') + 'Presentation</h3></div>' +
      '<div class="card-body">' +
      '<div class="field field--full mb-2" data-field="source">' +
        '<label>Registration source <span class="req">*</span></label>' +
        '<div class="radio-cards">' +
          Object.keys(cfg.SOURCES).map(function (key) {
            var source = cfg.SOURCES[key];
            return '<label class="radio-card">' +
              '<input type="radio" name="source" value="' + key + '"' + (key === 'emergency' ? ' checked' : '') + ' />' +
              '<span><strong>' + U.icon(source.icon) + ' ' + U.esc(source.label) + '</strong>' +
              '<span>' + U.esc(source.description) + '</span></span>' +
              '</label>';
          }).join('') +
        '</div><span class="field-error" data-error="source"></span>' +
      '</div>' +
      '<div class="form-grid">' +
        selectField({
          id: 'department', label: 'Department requested', required: true, value: 'Emergency',
          options: cfg.DEPARTMENTS.map(function (name) { return { value: name, label: name }; })
        }) +
        textField({ id: 'duration', label: 'Symptom duration', optional: true, placeholder: 'e.g. 2 hours / 3 days', help: 'Recent onset adds weight to the suggestion.' }) +
      '</div></div></div>';

    /* --- Symptoms --------------------------------------------------- */
    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-note') + 'Reported symptoms and history</h3></div>' +
      '<div class="card-body"><div class="form-grid">' +
        textareaField({
          id: 'symptoms', label: 'What does the patient report?', required: true, full: true, rows: 4,
          placeholder: 'e.g. Severe chest pain spreading to the left arm with sweating since this morning.',
          help: 'Write the patient’s own words. Warning-sign phrases are detected automatically, and the provisional priority updates as you type.'
        }) +
        textareaField({ id: 'conditions', label: 'Relevant medical conditions', optional: true, rows: 2, placeholder: 'e.g. High blood pressure, asthma, diabetes' }) +
        textareaField({ id: 'allergies', label: 'Allergies', optional: true, rows: 2, placeholder: 'e.g. Penicillin, latex, none known' }) +
      '</div></div></div>';

    /* --- Warning signs ---------------------------------------------- */
    html += '<div class="card"><div class="card-head" style="background:var(--red-050)">' +
      '<h3>' + U.icon('i-alert') + 'Critical warning signs</h3>' +
      '<div class="card-head-tools"><span class="badge badge--red">Any one of these escalates immediately</span></div></div>' +
      '<div class="card-body">' +
      '<p class="small muted mb-2">Tick every warning sign the patient has. Checking any box makes the provisional level <strong>Level 1 – Critical</strong> and raises the emergency alert across MediFlow. The list is configurable in Settings.</p>' +
      '<div class="warning-signs">' + settings.redFlags.map(function (flag) {
        return '<label class="sign-check">' +
          '<input type="checkbox" name="sign' + U.attr(flag.id) + '" data-flag="' + U.attr(flag.id) + '" />' +
          '<span>' + U.icon('i-warning', 'ico--sm') + ' ' + U.esc(flag.label) + '</span>' +
          '</label>';
      }).join('') + '</div>' +
      '</div></div>';

    /* --- Vitals ----------------------------------------------------- */
    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-thermometer') + 'Vital signs</h3>' +
      '<div class="card-head-tools"><span class="small muted">All optional, but strongly recommended</span></div></div>' +
      '<div class="card-body">' +
      '<p class="small muted mb-2">MediFlow will not rely on a low-priority classification when observations are missing — it raises the suggestion and asks for staff review instead.</p>' +
      '<div class="form-grid">' +
      Object.keys(cfg.VITALS).map(function (key) {
        var vital = cfg.VITALS[key];
        return numberField({
          id: key, label: vital.label, unit: vital.unit, optional: true,
          min: vital.min, max: vital.max, step: vital.step,
          placeholder: String(Math.round((vital.warnLow + vital.warnHigh) / 2)),
          help: 'Plausible range ' + vital.min + '–' + vital.max + ' ' + vital.unit
        });
      }).join('') +
      '</div></div></div>';

    html += '</div>';  /* end LEFT */

    /* ====================== RIGHT: live triage preview =============== */
    html += '<div class="stack">' +
      '<div id="triage-preview" aria-live="polite"></div>' +
      '<div class="card"><div class="card-head"><h3>' + U.icon('i-triage') + 'How the suggestion is built</h3></div>' +
        '<div class="card-body">' + ui.levelLegend() +
        '<div class="divider"></div>' +
        '<p class="small muted">MediFlow never uses age on its own, never escalates a patient to Level 2 on a single soft symptom, and never drops a patient to Routine when vital signs are missing. Every rule that fires is shown with its reason, and staff can override any suggestion with a recorded reason.</p>' +
        '</div></div>' +
      '</div>';

    html += '</div></form>';

    /* Sticky action bar */
    html += '<div class="sticky-actions">' +
      '<span class="flex-1 small muted" id="form-status">Fill in the patient details — the provisional priority updates live.</span>' +
      '<button class="btn btn--secondary" type="button" data-action="reset-form">' + U.icon('i-refresh') + 'Clear form</button>' +
      '<button class="btn btn--teal" type="button" data-action="save-pending">' + U.icon('i-clock') + 'Save without confirming priority</button>' +
      '<button class="btn" type="button" data-action="review-save">' + U.icon('i-check') + 'Review assessment &amp; register</button>' +
      '</div>';

    return html;
  }

  /* ---------------------------------------------------------------------
     Form reading & validation
     --------------------------------------------------------------------- */

  function readForm(root) {
    var form = U.$('#register-form', root);
    function value(name) {
      var node = U.$('[name="' + name + '"]', form);
      return node ? String(node.value).trim() : '';
    }
    var sourceNode = U.$('[name="source"]:checked', form);
    var flags = U.$$('[data-flag]', form).filter(function (input) { return input.checked; })
      .map(function (input) { return input.getAttribute('data-flag'); });

    return {
      name: value('name'),
      age: value('age'),
      gender: value('gender'),
      phone: value('phone'),
      source: sourceNode ? sourceNode.value : 'emergency',
      department: value('department'),
      symptomDuration: value('duration'),
      symptoms: value('symptoms'),
      conditions: value('conditions'),
      allergies: value('allergies'),
      redFlags: flags,
      vitals: {
        temperature: value('temperature'),
        pulse: value('pulse'),
        spo2: value('spo2'),
        systolic: value('systolic'),
        diastolic: value('diastolic')
      }
    };
  }

  function validate(values) {
    var errors = {};

    if (!values.name) errors.name = 'Enter the patient\u2019s full name.';
    else if (values.name.length < 2) errors.name = 'The name must be at least 2 characters.';

    var age = U.num(values.age, null);
    if (values.age === '') errors.age = 'Enter the patient\u2019s age in years.';
    else if (age === null) errors.age = 'Age must be a number.';
    else if (age < 0 || age > 120) errors.age = 'Age must be between 0 and 120 years.';

    if (values.phone && !U.isPhoneLike(values.phone)) errors.phone = 'Use digits, spaces and + ( ) - only.';

    if (!values.symptoms) errors.symptoms = 'Describe what the patient reports, even in a few words.';
    else if (values.symptoms.length < 3) errors.symptoms = 'Add a little more detail about the symptoms.';

    if (!cfg.SOURCES[values.source]) errors.source = 'Choose how the patient arrived.';
    if (cfg.DEPARTMENTS.indexOf(values.department) === -1) errors.department = 'Choose a department from the list.';

    Object.keys(cfg.VITALS).forEach(function (key) {
      var raw = values.vitals[key];
      if (raw === '') return;
      var value = U.num(raw, null);
      var vital = cfg.VITALS[key];
      if (value === null) errors[key] = vital.label + ' must be a number.';
      else if (value < vital.min || value > vital.max) {
        errors[key] = vital.label + ' must be between ' + vital.min + ' and ' + vital.max + ' ' + vital.unit + '.';
      }
    });

    var systolic = U.num(values.vitals.systolic, null);
    var diastolic = U.num(values.vitals.diastolic, null);
    if (systolic !== null && diastolic !== null && diastolic >= systolic) {
      errors.diastolic = 'Diastolic pressure should be lower than the systolic reading.';
    }

    return errors;
  }

  function showErrors(root, errors) {
    U.$$('.field-error', root).forEach(function (node) { node.textContent = ''; });
    U.$$('.field', root).forEach(function (node) { node.classList.remove('has-error'); });
    var firstBad = null;
    Object.keys(errors).forEach(function (key) {
      var container = U.$('[data-field="' + key + '"]', root) || U.$('[data-error="' + key + '"]', root);
      if (container && container.classList && container.getAttribute('data-field') === key) container.classList.add('has-error');
      var message = U.$('[data-error="' + key + '"]', root);
      if (message) message.textContent = errors[key];
      if (!firstBad) firstBad = container;
    });
    if (firstBad && firstBad.scrollIntoView) firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return Object.keys(errors).length === 0;
  }

  /* ---------------------------------------------------------------------
     Live preview
     --------------------------------------------------------------------- */

  function currentAssessment(root) {
    var values = readForm(root);
    return { values: values, assessment: MediFlow.triage.assess(values, MediFlow.store.settings) };
  }

  function renderPreview(root) {
    var host = U.$('#triage-preview', root);
    if (!host) return;
    var result = currentAssessment(root);
    var assessment = result.assessment;
    var info = cfg.PRIORITY_LEVELS[assessment.suggestedLevel];
    var status = U.$('#form-status', root);

    if (status) {
      status.innerHTML = 'Live provisional level: <strong>L' + assessment.suggestedLevel + ' · ' + U.esc(info.name) + '</strong> — ' +
        assessment.reasons.length + ' rule(s) fired' +
        (assessment.requiresStaffReview ? ' · <strong>staff review required</strong>' : '');
    }

    var html = '<div class="assessment-panel' + (assessment.criticalAlert ? ' assessment-panel--critical' : '') + '">' +
      '<div class="assessment-head">' +
        '<span class="level-pill level-pill--p' + assessment.suggestedLevel + '">L' + assessment.suggestedLevel + ' · ' + U.esc(info.name) + '</span>' +
        '<div class="flex-1">' +
          '<strong>' + U.esc(assessment.summary) + '</strong>' +
          '<p class="small muted">Basis: ' + U.esc(assessment.basis) + ' · combined score ' + assessment.score + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="assessment-body">';

    if (assessment.criticalAlert) {
      html += '<div class="alert alert--danger">' + U.icon('i-alert') +
        '<div><strong>EMERGENCY: critical warning sign reported</strong>' +
        '<p>Seek immediate clinical assessment now. Do not delay emergency care while completing registration.</p></div></div>';
    }

    if (assessment.requiresStaffReview) {
      html += '<div class="alert alert--warn">' + U.icon('i-eye') +
        '<div><strong>Staff review required</strong><ul>' +
        (assessment.reviewNotes.length ? assessment.reviewNotes : ['MediFlow needs a clinician to look at this record before the suggestion is relied on.'])
          .map(function (note) { return '<li>' + U.esc(note) + '</li>'; }).join('') +
        '</ul></div></div>';
    }

    html += '<div><h4 class="section-title">' + U.icon('i-note') + 'Reasons (' + assessment.reasons.length + ')</h4>' +
      shared.reasonList(assessment.reasons) + '</div>' +
      '<p class="xsmall muted">' + U.esc(cfg.DISCLAIMERS.triage) + '</p>' +
      '</div></div>';

    host.innerHTML = html;
  }

  /* ---------------------------------------------------------------------
     Saving
     --------------------------------------------------------------------- */

  function openConfirmDialog(root, confirmPriority) {
    var values = readForm(root);
    var errors = validate(values);
    if (!showErrors(root, errors)) {
      ui.toast.error('Please fix the highlighted fields', Object.keys(errors).length + ' field(s) still need attention.');
      return;
    }

    var assessment = MediFlow.triage.assess(values, MediFlow.store.settings);

    var summary = '<div class="alert alert--' + (assessment.criticalAlert ? 'danger' : 'info') + '">' +
      U.icon(assessment.criticalAlert ? 'i-alert' : 'i-triage') +
      '<div><strong>' + U.esc(assessment.summary) + '</strong>' +
      '<p>' + U.esc(assessment.basis) + ' · combined score ' + assessment.score + '</p>' +
      (assessment.requiresStaffReview ? '<p><strong>Staff review required:</strong> ' + U.esc(assessment.reviewNotes.join(' · ')) + '</p>' : '') +
      '</div></div>' +
      '<div class="mt-2">' + shared.reasonList(assessment.reasons) + '</div>';

    ui.dialog({
      title: 'Confirm the provisional priority',
      subtitle: values.name + ' · ' + values.department + ' · ' + cfg.SOURCES[values.source].label,
      icon: assessment.criticalAlert ? 'i-alert' : 'i-triage',
      iconTone: assessment.criticalAlert ? 'red' : undefined,
      size: 'lg',
      message: summary,
      fields: [
        {
          name: 'priority',
          label: 'Staff-confirmed priority',
          type: 'priority',
          required: true,
          value: assessment.suggestedLevel,
          hint: 'Pre-filled with the suggestion'
        },
        {
          name: 'reason',
          label: 'Reason for changing the suggested level',
          type: 'textarea',
          rows: 2,
          help: 'Required only when your choice differs from the suggestion. It is stored separately from the suggestion.',
          placeholder: 'e.g. Vital signs repeated and now normal; senior clinician reviewed the patient.'
        },
        { name: 'staff', label: 'Confirmed by (name / role)', type: 'text', value: shared.currentStaff() },
        { name: 'staffNote', label: 'Note to store with the record', type: 'textarea', rows: 2, placeholder: 'Optional — for example what has already been done for the patient.' }
      ],
      confirmLabel: confirmPriority ? 'Confirm priority & register' : 'Register without confirming',
      validate: function (dialogValues) {
        var dialogErrors = {};
        if (U.num(dialogValues.priority, null) !== assessment.suggestedLevel && U.clean(dialogValues.reason).length < 4) {
          dialogErrors.reason = 'Record why you are choosing a different level from the suggestion (at least 4 characters).';
        }
        return dialogErrors;
      }
    }).then(function (dialogValues) {
      if (!dialogValues) return;

      var result = MediFlow.store.create({
        name: values.name,
        age: values.age,
        gender: values.gender,
        phone: values.phone,
        symptoms: values.symptoms,
        symptomDuration: values.symptomDuration,
        conditions: values.conditions,
        allergies: values.allergies,
        vitals: values.vitals,
        redFlags: values.redFlags,
        department: values.department,
        source: values.source,
        triage: assessment,
        confirmedPriority: U.num(dialogValues.priority, null),
        overrideReason: dialogValues.reason,
        staff: dialogValues.staff,
        staffNote: dialogValues.staffNote
      });

      if (!result.ok) {
        showErrors(root, result.errors);
        ui.toast.error('Registration not saved', 'Please review the highlighted fields and try again.');
        return;
      }

      var patient = result.patient;
      if (assessment.criticalAlert) {
        ui.toast.error('EMERGENCY ALERT — ' + patient.id,
          'Critical warning sign reported for ' + patient.name + '. Seek immediate clinical assessment now.');
      } else {
        ui.toast.success('Patient registered — ' + patient.id,
          patient.name + ' was added to the queue at L' + patient.confirmedPriority + ' · ' + cfg.PRIORITY_LEVELS[patient.confirmedPriority].name + '.');
      }

      resetForm(U.$('#register-form', root), root);
      window.location.hash = '#/patient/' + encodeURIComponent(patient.id);
    });
  }

  function resetForm(form, root) {
    if (!form) return;
    form.reset();
    showErrors(root, {});
    renderPreview(root);
  }

  /* ---------------------------------------------------------------------
     Mount
     --------------------------------------------------------------------- */

  function mount(root) {
    var form = U.$('#register-form', root);
    if (!form) return;

    shared.bindPatientActions(root);

    var refresh = U.debounce(function () { renderPreview(root); }, 140);
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    renderPreview(root);

    U.on(root, 'click', '[data-action="review-save"]', function () { openConfirmDialog(root, true); });

    U.on(root, 'click', '[data-action="save-pending"]', function () {
      var values = readForm(root);
      var errors = validate(values);
      if (!showErrors(root, errors)) {
        ui.toast.error('Please fix the highlighted fields', Object.keys(errors).length + ' field(s) still need attention.');
        return;
      }
      var assessment = MediFlow.triage.assess(values, MediFlow.store.settings);

      ui.confirm({
        title: 'Register without confirming the priority?',
        subtitle: values.name + ' · suggested L' + assessment.suggestedLevel + ' · ' + cfg.PRIORITY_LEVELS[assessment.suggestedLevel].name,
        icon: 'i-clock',
        iconTone: 'amber',
        tone: 'warn',
        confirmLabel: 'Register as awaiting triage',
        message: '<div class="alert alert--warn">' + U.icon('i-warning') +
          '<div><strong>The patient will be added to the "awaiting triage confirmation" list</strong>' +
          '<p>They will be shown in a prominent amber strip on the dashboard and on the Triage page until a member of staff confirms their priority. This is allowed so nobody is blocked from registering, and nobody is forgotten.</p></div></div>' +
          (assessment.criticalAlert
            ? '<div class="alert alert--danger mt-2">' + U.icon('i-alert') + '<div><strong>A critical warning sign was reported</strong><p>The emergency alert is raised immediately — seek clinical assessment now.</p></div></div>'
            : ''),
        fields: [{ name: 'staff', label: 'Registered by', type: 'text', value: shared.currentStaff() }]
      }).then(function (dialogValues) {
        if (!dialogValues) return;
        var result = MediFlow.store.create({
          name: values.name,
          age: values.age,
          gender: values.gender,
          phone: values.phone,
          symptoms: values.symptoms,
          symptomDuration: values.symptomDuration,
          conditions: values.conditions,
          allergies: values.allergies,
          vitals: values.vitals,
          redFlags: values.redFlags,
          department: values.department,
          source: values.source,
          triage: assessment,
          confirmedPriority: null,
          staff: dialogValues.staff
        });
        if (!result.ok) {
          showErrors(root, result.errors);
          ui.toast.error('Registration not saved', 'Please review the highlighted fields and try again.');
          return;
        }
        ui.toast.warn('Awaiting triage confirmation — ' + result.patient.id,
          result.patient.name + ' was registered with the suggested L' + assessment.suggestedLevel + ' and needs a staff decision.');
        resetForm(form, root);
        window.location.hash = '#/triage';
      });
    });

    U.on(root, 'click', '[data-action="reset-form"]', function () {
      ui.confirm({
        title: 'Clear the form?',
        subtitle: 'Everything typed on this page will be removed',
        icon: 'i-refresh',
        size: 'sm',
        confirmLabel: 'Clear form'
      }).then(function (confirmed) {
        if (!confirmed) return;
        resetForm(form, root);
        ui.toast.info('Form cleared', 'The registration form is ready for a new patient.');
      });
    });

    /* Focus the first field for keyboard users. */
    var first = U.$('#name', root);
    if (first) first.focus();
  }

  /* Registration must never lose what the user typed because data changed
     somewhere else, so this page only refreshes its chrome. */
  function update() { /* intentionally no re-render */ }

  return { meta: meta, render: render, mount: mount, update: update };
})();
