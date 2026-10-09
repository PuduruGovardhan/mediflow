/* ==========================================================================
   MediFlow | js/views/settings.js
   --------------------------------------------------------------------------
   Settings, configurable warning signs and demo/data management.

   Everything that influences triage or waiting estimates is editable here, so
   the "configurable list of warning signs" requirement is satisfied by the
   product itself rather than only by editing source code.
   ========================================================================== */

window.MediFlow = window.MediFlow || {};
MediFlow.views = MediFlow.views || {};

MediFlow.views.settings = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;
  var ui = MediFlow.ui;
  var shared = MediFlow.views.shared;

  var meta = {
    name: 'settings',
    title: 'Settings & Demo Data',
    subtitle: 'Triage rules, waiting estimate model and data management'
  };

  function render() {
    var store = MediFlow.store;
    var settings = store.settings;
    var storage = MediFlow.storage.status();
    var described = MediFlow.demo.describe();
    var counts = store.counts();
    var sizeKb = (MediFlow.storage.sizeBytes() / 1024).toFixed(1);

    var html = shared.pageHead({
      icon: 'i-settings',
      title: 'Settings &amp; demo data',
      subtitle: 'Tune the rules, manage the fictional demonstration data and handle the stored records. Changes take effect immediately and persist in this browser.',
      tools: '<a class="btn btn--secondary" href="#/dashboard">' + U.icon('i-dashboard') + 'Back to dashboard</a>'
    });

    /* --------------------------- storage status ----------------------- */
    html += '<div class="alert alert--' + (storage.persistent ? 'success' : 'warn') + ' mb-2">' +
      U.icon(storage.persistent ? 'i-database' : 'i-warning') +
      '<div><strong>' + (storage.persistent ? 'Persistent storage active' : 'Memory-only session') + '</strong>' +
      '<p>' + U.esc(storage.message) + '</p>' +
      (storage.persistent ? '<p class="small">Using about ' + sizeKb + ' KB of browser storage for ' + counts.total + ' patient record(s).</p>' : '') +
      '</div></div>';

    /* ------------------------- staff identity ------------------------- */
    html += '<div class="grid grid--2 mb-2">';

    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-user') + 'Signed-in staff (demo)</h3></div>' +
      '<div class="card-body">' +
      '<p class="small muted mb-2">Every confirmation, status change and note is stamped with this name so the record shows who made the decision. In a real deployment this would come from hospital single sign-on.</p>' +
      '<div class="form-grid">' +
        '<div class="field"><label for="staff-name">Name</label><input id="staff-name" type="text" value="' + U.attr(settings.staffName) + '" /></div>' +
        '<div class="field"><label for="staff-role">Role</label><input id="staff-role" type="text" value="' + U.attr(settings.staffRole) + '" /></div>' +
        '<div class="field"><label for="staff-initials">Initials (shown in the top bar)</label><input id="staff-initials" type="text" maxlength="3" value="' + U.attr(settings.staffInitials) + '" /></div>' +
      '</div>' +
      '<div class="btn-row mt-2"><button class="btn" data-action="save-staff">' + U.icon('i-check') + 'Save staff details</button></div>' +
      '</div></div>';

    /* ------------------------ waiting estimate ------------------------ */
    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-clock') + 'Waiting estimate model</h3></div>' +
      '<div class="card-body">' +
      '<p class="small muted mb-2">These numbers only drive the illustrative estimate. They are arithmetic assumptions, not clinical facts.</p>' +
      '<div class="form-grid">' +
        '<div class="field"><label for="set-rooms">Consultation rooms in use</label>' +
          '<input id="set-rooms" type="number" min="1" max="50" value="' + U.attr(settings.consultRooms) + '" />' +
          '<span class="help">Used to spread the backlog across the team.</span></div>' +
        '<div class="field"><label for="set-spread">Estimate range (± %)</label>' +
          '<input id="set-spread" type="number" min="0" max="90" value="' + U.attr(settings.waitSpreadPercent) + '" />' +
          '<span class="help">The estimate is shown as a range because real times vary.</span></div>' +
        '<div class="field"><label for="set-round">Round estimates to (minutes)</label>' +
          '<input id="set-round" type="number" min="1" max="60" value="' + U.attr(settings.waitRoundMinutes) + '" /></div>' +
        '<div class="field"><label for="set-threshold">Long-wait alert threshold (minutes)</label>' +
          '<input id="set-threshold" type="number" min="5" max="1440" value="' + U.attr(settings.longWaitThresholdMinutes) + '" />' +
          '<span class="help">Patients waiting longer than this are flagged on the dashboard and queue.</span></div>' +
        '<div class="field field--full"><label class="checkline"><input type="checkbox" id="set-wait-enabled"' + (settings.waitEnabled ? ' checked' : '') + ' /> ' +
          '<span>Show illustrative waiting estimates to staff</span></label></div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<h4 class="mb-1">Illustrative average service duration per priority level</h4>' +
      '<div class="form-grid">' + [1, 2, 3, 4].map(function (level) {
        var info = cfg.PRIORITY_LEVELS[level];
        return '<div class="field"><label for="set-service-' + level + '">' +
          '<span class="badge badge--p' + level + '">' + U.esc(info.label) + '</span> ' + U.esc(info.name) + '</label>' +
          '<input id="set-service-' + level + '" type="number" min="1" max="600" value="' + U.attr(settings.serviceMinutes[level]) + '" />' +
          '<span class="help">minutes</span></div>';
      }).join('') + '</div>' +
      '<div class="btn-row mt-2">' +
        '<button class="btn" data-action="save-operations">' + U.icon('i-check') + 'Save operational settings</button>' +
        '<button class="btn btn--secondary" data-action="reset-settings">' + U.icon('i-refresh') + 'Restore defaults</button>' +
      '</div>' +
      '</div></div>';

    html += '</div>';  /* end grid */

    /* ------------------------ configurable warning signs --------------- */
    html += '<div class="card mb-2"><div class="card-head">' +
      '<h3>' + U.icon('i-alert') + 'Critical warning signs (configurable)</h3>' +
      '<div class="card-head-tools"><span class="badge badge--red">' + settings.redFlags.length + ' configured</span>' +
      '<button class="btn btn--secondary btn--sm" data-action="add-flag">' + U.icon('i-plus', 'ico--sm') + 'Add warning sign</button></div></div>' +
      '<div class="card-body">' +
      '<p class="small muted mb-2">Any single one of these produces a Level 1 suggestion and raises the emergency alert. The keywords are also matched against the free-text symptom description, so typing "chest pain" triggers the same alert as ticking the box.</p>' +
      '<div class="table-wrap"><table class="cfg-table">' +
      '<thead><tr><th scope="col" style="width:26%">Warning sign</th><th scope="col">Keywords detected in the symptom text (comma separated)</th><th scope="col" class="right">Remove</th></tr></thead>' +
      '<tbody>' + settings.redFlags.map(function (flag, index) {
        return '<tr>' +
          '<td><input type="text" data-flag-label="' + index + '" value="' + U.attr(flag.label) + '" aria-label="Warning sign label" /></td>' +
          '<td><input type="text" data-flag-keywords="' + index + '" value="' + U.attr((flag.keywords || []).join(', ')) + '" aria-label="Keywords" /></td>' +
          '<td class="right"><button class="btn btn--danger btn--sm" data-action="remove-flag" data-index="' + index + '" aria-label="Remove ' + U.attr(flag.label) + '">' + U.icon('i-trash', 'ico--sm') + '</button></td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="btn-row mt-2"><button class="btn" data-action="save-flags">' + U.icon('i-check') + 'Save warning signs</button></div>' +
      '</div></div>';

    /* ---------------------------- demo data ---------------------------- */
    html += '<div class="grid grid--2 mb-2">';

    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-database') + 'Fictional demo patients</h3></div>' +
      '<div class="card-body">' +
      '<p class="small mb-2">Load ' + described.count + ' invented patients to demonstrate the triage rules, the queue ordering and the analytics. Every record is marked <span class="badge badge--demo">DEMO</span> throughout the app.</p>' +
      '<div class="chip-row mb-2">' +
        '<span class="chip chip--red">' + described.critical + ' critical</span>' +
        '<span class="chip chip--amber">' + described.high + ' high priority</span>' +
        '<span class="chip chip--amber">' + described.moderate + ' moderate</span>' +
        '<span class="chip chip--teal">' + described.routine + ' routine</span>' +
        '<span class="chip">' + described.pending + ' awaiting triage</span>' +
      '</div>' +
      '<div class="alert alert--info">' + U.icon('i-shield') +
        '<div><strong>No real patient information</strong><p>' + U.esc(cfg.DISCLAIMERS.demo) + '</p></div></div>' +
      '<div class="btn-row mt-2">' +
        '<button class="btn" data-action="load-demo">' + U.icon('i-database') + 'Load demo patients</button>' +
        '<button class="btn btn--warn" data-action="reset-demo"' + (counts.demo ? '' : ' disabled') + '>' + U.icon('i-refresh') + 'Reset / remove demo data</button>' +
      '</div>' +
      '<p class="small muted mt-1">' + counts.demo + ' demo record(s) currently loaded · ' + (counts.total - counts.demo) + ' record(s) entered by staff.</p>' +
      '</div></div>';

    /* -------------------------- data management ----------------------- */
    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-download') + 'Data management</h3></div>' +
      '<div class="card-body">' +
      '<p class="small muted mb-2">Back up the records as a JSON file, restore them on another machine, or clear everything. In a hospital deployment this data would live in an audited database with access control, not in a browser.</p>' +
      '<div class="btn-row mb-2">' +
        '<button class="btn btn--secondary" data-action="export">' + U.icon('i-download') + 'Export JSON backup</button>' +
        '<button class="btn btn--secondary" data-action="import">' + U.icon('i-upload') + 'Import backup</button>' +
        '<input type="file" id="import-file" accept="application/json,.json" class="hidden" />' +
      '</div>' +
      '<div class="alert alert--danger">' + U.icon('i-warning') +
        '<div><strong>Danger zone</strong><p>Deleting records cannot be undone. Export a backup first if you need to keep them.</p>' +
        '<div class="btn-row mt-2">' +
          '<button class="btn btn--danger" data-action="clear-all">' + U.icon('i-trash') + 'Delete every patient record</button>' +
          '<button class="btn btn--secondary" data-action="reset-settings">' + U.icon('i-refresh') + 'Restore default settings</button>' +
        '</div></div></div>' +
      '</div></div>';

    html += '</div>';

    /* ------------------------------ about ----------------------------- */
    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-info') + 'About this prototype</h3></div>' +
      '<div class="card-body">' +
      '<dl class="dl">' +
        '<dt>Application</dt><dd>' + U.esc(cfg.APP.fullName) + '</dd>' +
        '<dt>Tagline</dt><dd>' + U.esc(cfg.APP.tagline) + '</dd>' +
        '<dt>Version</dt><dd>' + U.esc(cfg.APP.version) + ' (' + U.esc(cfg.APP.build) + ')</dd>' +
        '<dt>Storage</dt><dd>Browser localStorage — no server, no internet connection required</dd>' +
        '<dt>Charts</dt><dd>' + (MediFlow.charts.available()
          ? 'Chart.js loaded; a built-in CSS fallback is used if it is unavailable'
          : 'Chart library not available — charts are drawn with the built-in CSS fallback') + '</dd>' +
      '</dl>' +
      '<div class="divider"></div>' +
      '<h4 class="mb-1">Known limitations</h4>' +
      '<ul class="small muted">' +
        '<li>Rule-based triage assistance only: not a diagnosis, not a validated triage scale (such as a national early warning score) and not a substitute for clinical judgement.</li>' +
        '<li>Data is stored per browser. It is not shared between devices or users, and browser storage can be cleared externally.</li>' +
        '<li>Waiting times are illustrative arithmetic estimates. Emergencies, staffing levels and treatment complexity change real waiting times.</li>' +
        '<li>No authentication: the "signed-in staff" identity is a demo setting, not a security control.</li>' +
        '<li>No audit trail beyond the per-patient history stored in this browser.</li>' +
      '</ul>' +
      '<div class="alert alert--warn mt-2">' + U.icon('i-shield') +
        '<div><strong>' + U.esc(cfg.DISCLAIMERS.prototype) + '</strong>' +
        '<p>MediFlow is a hackathon prototype built to demonstrate patient flow and transparent triage logic. Do not use it with real patient information.</p></div></div>' +
      '</div></div>';

    return html;
  }

  /* ---------------------------------------------------------------------
     Actions
     --------------------------------------------------------------------- */

  function readSettingsForm(root) {
    function value(id, fallback) {
      var node = U.$('#' + id, root);
      return node ? node.value : fallback;
    }
    return {
      staffName: value('staff-name', ''),
      staffRole: value('staff-role', ''),
      staffInitials: value('staff-initials', ''),
      consultRooms: U.num(value('set-rooms', ''), null),
      waitSpreadPercent: U.num(value('set-spread', ''), null),
      waitRoundMinutes: U.num(value('set-round', ''), null),
      longWaitThresholdMinutes: U.num(value('set-threshold', ''), null),
      waitEnabled: !!(U.$('#set-wait-enabled', root) || {}).checked,
      serviceMinutes: {
        1: U.num(value('set-service-1', ''), null),
        2: U.num(value('set-service-2', ''), null),
        3: U.num(value('set-service-3', ''), null),
        4: U.num(value('set-service-4', ''), null)
      }
    };
  }

  function saveOperations(root) {
    var patch = readSettingsForm(root);
    var result = MediFlow.store.updateSettings({
      consultRooms: patch.consultRooms,
      waitSpreadPercent: patch.waitSpreadPercent,
      waitRoundMinutes: patch.waitRoundMinutes,
      longWaitThresholdMinutes: patch.longWaitThresholdMinutes,
      waitEnabled: patch.waitEnabled,
      serviceMinutes: patch.serviceMinutes
    });
    if (!result.ok) {
      ui.toast.error('Settings not saved', Object.keys(result.errors).map(function (key) { return result.errors[key]; }).join(' '));
      return;
    }
    ui.toast.success('Operational settings saved', 'Waiting estimates and long-wait thresholds now use the new values.');
  }

  function saveStaff(root) {
    var patch = readSettingsForm(root);
    if (!U.clean(patch.staffName)) {
      ui.toast.error('Name required', 'Enter the name that should sign every action.');
      return;
    }
    var result = MediFlow.store.updateSettings({
      staffName: U.clean(patch.staffName, 60),
      staffRole: U.clean(patch.staffRole, 60),
      staffInitials: U.clean(patch.staffInitials, 3).toUpperCase()
    });
    if (!result.ok) {
      ui.toast.error('Not saved', Object.values(result.errors).join(' '));
      return;
    }
    ui.toast.success('Staff details saved', 'New actions will be signed "' + U.clean(patch.staffName, 60) + '".');
  }

  function saveFlags(root) {
    var labels = U.$$('[data-flag-label]', root);
    var keywords = U.$$('[data-flag-keywords]', root);
    var existing = MediFlow.store.settings.redFlags;
    var next = [];

    labels.forEach(function (input, index) {
      var label = U.clean(input.value, 90);
      var keywordInput = keywords[index];
      var list = keywordInput ? keywordInput.value.split(',')
        .map(function (item) { return U.clean(item, 60).toLowerCase(); })
        .filter(Boolean) : [];
      if (!label) return;
      next.push({
        id: (existing[index] && existing[index].id) || U.uid('flag'),
        label: label,
        keywords: list
      });
    });

    if (!next.length) {
      ui.toast.error('Warning signs not saved', 'Keep at least one warning sign in the list.');
      return;
    }
    if (next.some(function (flag) { return !flag.keywords.length; })) {
      ui.toast.error('Warning signs not saved', 'Every warning sign needs at least one keyword so it can be detected in the symptom text.');
      return;
    }
    var result = MediFlow.store.updateSettings({ redFlags: next });
    if (!result.ok) {
      ui.toast.error('Not saved', Object.values(result.errors).join(' '));
      return;
    }
    ui.toast.success('Warning signs saved', next.length + ' warning sign(s) are now active. Any one of them produces a Level 1 suggestion.');
  }

  function mount(root) {
    shared.bindPatientActions(root);

    U.on(root, 'click', '[data-action="save-operations"]', function () { saveOperations(root); });
    U.on(root, 'click', '[data-action="save-staff"]', function () { saveStaff(root); });
    U.on(root, 'click', '[data-action="save-flags"]', function () { saveFlags(root); });

    U.on(root, 'click', '[data-action="add-flag"]', function () {
      var flags = U.clone(MediFlow.store.settings.redFlags);
      flags.push({ id: U.uid('flag'), label: 'New warning sign', keywords: [] });
      var result = MediFlow.store.updateSettings({ redFlags: flags });
      if (!result.ok) { ui.toast.error('Could not add', Object.values(result.errors).join(' ')); return; }
      ui.toast.info('Warning sign added', 'Give it a clear label and at least one keyword, then save.');
    });

    U.on(root, 'click', '[data-action="remove-flag"]', function (event, button) {
      var index = Number(button.getAttribute('data-index'));
      var flags = U.clone(MediFlow.store.settings.redFlags);
      var removed = flags[index];
      if (!removed) return;
      if (flags.length <= 1) {
        ui.toast.error('Cannot remove', 'At least one critical warning sign must remain configured.');
        return;
      }
      ui.confirm({
        title: 'Remove this warning sign?',
        subtitle: removed.label,
        icon: 'i-trash',
        iconTone: 'red',
        tone: 'danger',
        confirmLabel: 'Remove warning sign',
        message: '<div class="alert alert--danger">' + U.icon('i-warning') +
          '<div><strong>Future registrations will no longer escalate on this sign</strong>' +
          '<p>Existing patient records keep the warning sign they were registered with. Only the rule list changes.</p></div></div>'
      }).then(function (confirmed) {
        if (!confirmed) return;
        flags.splice(index, 1);
        var result = MediFlow.store.updateSettings({ redFlags: flags });
        if (!result.ok) { ui.toast.error('Could not remove', Object.values(result.errors).join(' ')); return; }
        ui.toast.warn('Warning sign removed', '"' + removed.label + '" is no longer part of the critical list.');
      });
    });

    U.on(root, 'click', '[data-action="reset-settings"]', function () {
      ui.confirm({
        title: 'Restore default settings?',
        subtitle: 'Triage rules, warning signs and waiting model',
        icon: 'i-refresh',
        confirmLabel: 'Restore defaults',
        message: '<p>The warning sign list, symptom rules and waiting-estimate numbers will be reset to the values MediFlow ships with. Patient records are not touched.</p>'
      }).then(function (confirmed) {
        if (!confirmed) return;
        MediFlow.store.resetSettings();
        ui.toast.success('Defaults restored', 'The original warning signs, rules and waiting model are active again.');
      });
    });

    /* Demo data */
    U.on(root, 'click', '[data-action="load-demo"]', function () { MediFlow.actions.loadDemoData(); });
    U.on(root, 'click', '[data-action="reset-demo"]', function () { MediFlow.actions.resetDemoData(); });
    U.on(root, 'click', '[data-action="clear-all"]', function () { MediFlow.actions.clearEverything(); });

    /* Export / import */
    U.on(root, 'click', '[data-action="export"]', function () {
      var json = MediFlow.store.exportJson();
      U.download('mediflow-backup-' + new Date().toISOString().slice(0, 10) + '.json', json, 'application/json');
      ui.toast.success('Backup exported', 'The JSON file contains every record and setting currently stored in this browser.');
    });

    U.on(root, 'click', '[data-action="import"]', function () {
      var input = U.$('#import-file', root);
      if (input) input.click();
    });

    U.on(root, 'change', '#import-file', function (event, input) {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var result = MediFlow.store.importJson(String(reader.result), { mode: 'merge' });
        if (!result.ok) {
          ui.toast.error('Import failed', result.error);
          return;
        }
        ui.toast.success('Backup imported', 'Records that were not already present have been added (existing IDs are kept unchanged).');
        input.value = '';
      };
      reader.onerror = function () { ui.toast.error('Import failed', 'The file could not be read.'); };
      reader.readAsText(file);
    });
  }

  function update(root) {
    var view = MediFlow.router.renderInto(root, render());
    if (view) mount(view);
  }

  return { meta: meta, render: render, mount: mount, update: update };
})();
