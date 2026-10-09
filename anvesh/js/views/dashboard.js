/* ==========================================================================
   MediFlow | js/views/dashboard.js
   --------------------------------------------------------------------------
   The live operational overview. Every figure is derived from the store at
   render time, and MediFlow re-renders this page automatically whenever a
   patient record changes, so the numbers can never go stale.
   ========================================================================== */

window.MediFlow = window.MediFlow || {};
MediFlow.views = MediFlow.views || {};

MediFlow.views.dashboard = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;
  var ui = MediFlow.ui;
  var shared = MediFlow.views.shared;

  var meta = {
    name: 'dashboard',
    title: 'Dashboard',
    subtitle: 'Live overview of patient flow'
  };

  function render() {
    var store = MediFlow.store;
    var stats = store.stats();
    var counts = stats.counts;
    var queue = store.activeQueue();
    var pending = store.pendingTriage();
    var longWaiters = store.longWaiters();
    var recent = store.recent(6);
    var queuePreview = queue.slice(0, 8);
    var waitSettings = MediFlow.waiting.settings();

    if (!store.all().length) return emptyDashboard();

    var html = '';

    /* ---------------------------- page head --------------------------- */
    html += shared.pageHead({
      icon: 'i-dashboard',
      title: 'Live dashboard',
      subtitle: 'Everything below is calculated from the patient records currently stored in this browser. It updates itself the moment a record changes.',
      tools:
        '<a class="btn btn--secondary" href="#/queue">' + U.icon('i-queue') + 'Open live queue</a>' +
        '<button class="btn" data-action="refresh">' + U.icon('i-refresh') + 'Refresh now</button>'
    });

    /* --------------------------- stat cards --------------------------- */
    html += '<div class="grid grid--4 mb-2">' +
      shared.statCard({
        label: 'Total registered', icon: 'i-users', value: counts.total,
        foot: stats.registeredToday + ' registered today · ' + counts.demo + ' demo ' + U.plural(counts.demo, 'record')
      }) +
      shared.statCard({
        label: 'Waiting', icon: 'i-clock', tone: 'teal', value: counts.waiting,
        foot: counts.reassessment ? counts.reassessment + ' flagged for reassessment' : 'Including any reassessment flags'
      }) +
      shared.statCard({
        label: 'Urgent (Level 1–2)', icon: 'i-alert', tone: 'red', value: counts.urgent,
        foot: stats.distribution[1] + ' critical · ' + stats.distribution[2] + ' high priority',
        pulse: true
      }) +
      shared.statCard({
        label: 'In consultation', icon: 'i-stethoscope', tone: 'teal', value: counts.inConsultation,
        foot: waitSettings.consultRooms + ' consultation ' + U.plural(waitSettings.consultRooms, 'room') + ' configured'
      }) +
      shared.statCard({
        label: 'Completed', icon: 'i-check-circle', tone: 'green', value: counts.completed,
        foot: stats.completedToday + ' completed today'
      }) +
      shared.statCard({
        label: 'Average wait (measured)', icon: 'i-trending', tone: 'slate',
        value: stats.wait.averageWaitMinutes, unit: 'min',
        foot: 'Measured from registration to first clinical contact for patients already seen'
      }) +
      '</div>';

    /* -------------------- waiting-time estimate panel ------------------ */
    var estimateTone = stats.wait.averageWaitMinutes > waitSettings.longWaitMinutes ? 'warn' : 'info';
    html += '<div class="alert alert--' + estimateTone + ' mb-2">' + U.icon('i-clock') +
      '<div><strong>Illustrative waiting estimate — not a prediction</strong>' +
      '<p>The configured average service durations put the current backlog at about <strong>' +
        stats.wait.backlogMinutes + ' minutes of work</strong> across ' + waitSettings.consultRooms +
        ' consultation ' + U.plural(waitSettings.consultRooms, 'room') +
        (stats.wait.queueDrainMinutes ? ', so the queue would take roughly ' + stats.wait.queueDrainMinutes + ' minutes to clear if nothing changed' : '') +
      '. ' + U.esc(cfg.DISCLAIMERS.wait) + '</p>' +
      (stats.wait.longestWait
        ? '<p class="small">Longest current wait: <strong>' + U.esc(stats.wait.longestWait.patient.name) + '</strong> (' +
          U.esc(stats.wait.longestWait.patient.id) + ') — ' + U.durationLabel(stats.wait.longestWait.patient.registeredAt) + '.</p>'
        : '') +
      '</div></div>';

    /* ----------------------- pending triage strip --------------------- */
    if (pending.length) {
      html += '<div class="card mb-2" style="border-color:#fec84b;border-width:2px">' +
        '<div class="card-head" style="background:var(--amber-050)">' +
          '<h2>' + U.icon('i-triage') + 'Awaiting triage confirmation <span class="badge badge--amber">' + pending.length + '</span></h2>' +
          '<div class="card-head-tools"><a class="btn btn--warn btn--sm" href="#/triage">' + U.icon('i-chevron-right', 'ico--sm') + 'Open triage page</a></div>' +
        '</div>' +
        '<div class="card-body card-body--tight">' +
          '<p class="small muted mb-1">These patients are registered but a member of staff has not yet confirmed their priority, so they are deliberately kept out of the ordered queue until they are reviewed.</p>' +
          '<div class="items-grid">' + pending.map(pendingCard).join('') + '</div>' +
        '</div></div>';
    }

    /* ------------------------------ two column ------------------------ */
    html += '<div class="grid grid--sidebar-right">';

    /* LEFT: queue preview */
    html += '<div class="stack">';

    if (longWaiters.length) {
      html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-warning') +
        'Long waits needing attention <span class="badge badge--amber">' + longWaiters.length + '</span></h3>' +
        '<div class="card-head-tools"><span class="small muted">Threshold: ' + waitSettings.longWaitMinutes + ' min</span></div></div>' +
        '<div class="card-body card-body--tight"><p class="small muted mb-1">Routine patients are never silently forgotten. Consider reassessing these patients:</p>' +
        '<div class="chip-row">' + longWaiters.slice(0, 8).map(function (patient) {
          return '<span class="chip chip--amber">' + U.icon('i-clock') + U.esc(patient.id + ' · ' + patient.name) +
            ' (' + U.esc(U.durationLabel(patient.registeredAt)) + ')' +
            '<button class="btn btn--ghost btn--sm" data-action="reassess" data-id="' + U.attr(patient.id) + '">Reassess</button>' +
            '</span>';
        }).join('') + '</div></div></div>';
    }

    html += '<div class="card"><div class="card-head">' +
      '<h3>' + U.icon('i-queue') + 'Current queue, ordered by urgency</h3>' +
      '<div class="card-head-tools">' +
        '<span class="badge badge--neutral">' + queue.length + ' in queue</span>' +
        '<a class="btn btn--secondary btn--sm" href="#/queue">' + U.icon('i-eye', 'ico--sm') + 'Full queue</a>' +
      '</div></div>' +
      '<div class="card-body card-body--tight">' +
        (queue.length
          ? shared.queueTable(queuePreview, { caption: 'Top of the queue. Level 1 first, then earliest registration within each level.' }) +
            (queue.length > queuePreview.length
              ? '<p class="small muted mt-1">Showing 8 of ' + queue.length + ' — open the live queue for the full list.</p>'
              : '')
          : ui.empty('i-queue', 'No confirmed patients in the queue',
              'Register a patient or confirm the triage suggestion of a pending patient to populate the queue.',
              '<a class="btn" href="#/register">' + U.icon('i-user-plus') + 'Register a patient</a>' +
              '<button class="btn btn--secondary" data-action="load-demo">' + U.icon('i-database') + 'Load demo patients</button>')) +
      '</div></div>';

    html += '</div>';  /* end LEFT */

    /* RIGHT: charts, recent */
    html += '<div class="stack">';

    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-chart') + 'Patient distribution by priority</h3></div>' +
      '<div class="card-body"><div class="chart-box chart-box--sm"><canvas id="chart-distribution" aria-label="Chart of active patients by priority level" role="img"></canvas>' +
      '<div class="chart-fallback"></div></div>' +
      '<p class="small muted mt-1">Active patients only, using the staff-confirmed level where it exists and the suggestion otherwise.</p>' +
      (stats.distribution.unconfirmed
        ? '<p class="small muted">' + stats.distribution.unconfirmed + ' patient(s) have no confirmed priority yet.</p>' : '') +
      '</div></div>';

    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-user-plus') + 'Recent registrations</h3>' +
      '<div class="card-head-tools"><a class="btn btn--ghost btn--sm" href="#/register">' + U.icon('i-plus', 'ico--sm') + 'New</a></div></div>' +
      '<div class="card-body card-body--tight">' +
      (recent.length
        ? '<div class="stack stack--sm">' + recent.map(function (patient) {
            return '<div class="flex-between" style="gap:10px">' +
              '<div class="flex-1" style="gap:8px">' +
                '<span class="avatar">' + U.esc(U.initials(patient.name)) + '</span>' +
                '<div class="cell-stack">' +
                  '<strong class="truncate">' + U.esc(patient.name) + '</strong>' +
                  '<span>' + U.esc(patient.id) + ' · ' + U.esc(patient.department) + ' · ' + U.esc(U.relativeLabel(patient.registeredAt)) + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="chip-row">' + shared.priorityCell(patient) + ui.demoBadge(patient.demo) +
                '<button class="btn btn--secondary btn--sm" data-action="open" data-id="' + U.attr(patient.id) + '" aria-label="Open ' + U.attr(patient.name) + '">' + U.icon('i-chevron-right', 'ico--sm') + '</button>' +
              '</div>' +
              '</div>';
          }).join('') + '</div>'
        : ui.empty('i-user-plus', 'No registrations yet', 'Newly registered patients appear here.')) +
      '</div></div>';

    html += '</div>';  /* end RIGHT */
    html += '</div>';  /* end grid */

    return html;
  }

  function pendingCard(patient) {
    var level = U.num(patient.suggestedPriority, null);
    return '<article class="item-card">' +
      '<div class="item-card-head">' +
        '<div class="flex-1">' +
          '<span class="flex" style="gap:6px;flex-wrap:wrap">' +
            '<span class="pid">' + U.esc(patient.id) + '</span>' +
            (level ? ui.priorityBadge(level, { soft: true }) : '') +
            ui.demoBadge(patient.demo) +
          '</span>' +
          '<strong>' + U.esc(patient.name) + '</strong>' +
          '<span class="small muted">' + U.esc(String(patient.age)) + ' yrs · ' + U.esc(patient.department) + ' · registered ' + U.esc(U.relativeLabel(patient.registeredAt)) + '</span>' +
        '</div>' +
      '</div>' +
      '<p class="small">' + U.esc(U.clean(patient.symptoms, 130)) + '</p>' +
      (patient.criticalAlert
        ? '<div class="alert alert--danger">' + U.icon('i-alert') + '<div><strong>Critical warning sign reported</strong><p>Seek immediate clinical assessment now.</p></div></div>'
        : '') +
      '<div class="btn-row">' +
        '<button class="btn btn--sm" data-action="priority" data-id="' + U.attr(patient.id) + '">' + U.icon('i-check', 'ico--sm') + 'Confirm priority</button>' +
        '<button class="btn btn--secondary btn--sm" data-action="open" data-id="' + U.attr(patient.id) + '">' + U.icon('i-eye', 'ico--sm') + 'Open</button>' +
      '</div>' +
      '</article>';
  }

  function emptyDashboard() {
    var described = MediFlow.demo.describe();
    return shared.pageHead({
      icon: 'i-dashboard',
      title: 'Welcome to MediFlow',
      subtitle: 'Right Priority. Better Patient Flow. — Register patients, review the rule-based triage suggestion, and manage the queue from registration to consultation.'
    }) +
      '<div class="card"><div class="card-body">' +
      ui.empty('i-database', 'No patient records yet',
        'Start by loading the fictional demo patients to see the dashboard, queue ordering and analytics working immediately. Every demo record is invented and clearly marked as demo data.',
        '<button class="btn" data-action="load-demo">' + U.icon('i-database') + 'Load ' + described.count + ' fictional demo patients</button>' +
        '<a class="btn btn--secondary" href="#/register">' + U.icon('i-user-plus') + 'Register a real patient</a>') +
      '<div class="mt-3">' + ui.levelLegend() + '</div>' +
      '<div class="mt-3">' + ui.alertBox('warn', 'i-shield', 'Prototype, not a medical device',
        '<p>' + U.esc(cfg.DISCLAIMERS.prototype) + ' ' + U.esc(cfg.DISCLAIMERS.demo) + '</p>') + '</div>' +
      '</div></div>';
  }

  /** Called by the router after the HTML has been inserted. */
  function mount(root) {
    shared.bindPatientActions(root);

    U.on(root, 'click', '[data-action="refresh"]', function () {
      ui.toast.info('Refreshed', 'Dashboard figures were recalculated from the stored records at ' + U.timeLabel(new Date()) + '.');
      MediFlow.router.refresh();
    });

    /* Demo loading is offered from the dashboard too. */
    U.on(root, 'click', '[data-action="load-demo"]', function () {
      MediFlow.actions.loadDemoData();
    });

    registerCharts();
    MediFlow.charts.rebuildAll();
  }

  function registerCharts() {
    MediFlow.charts.register('chart-distribution', function () {
      var distribution = MediFlow.store.byLevel();
      var labels = ['L1 Critical', 'L2 High', 'L3 Moderate', 'L4 Routine'];
      var values = [distribution[1], distribution[2], distribution[3], distribution[4]];
      var colors = [MediFlow.charts.palette.p1, MediFlow.charts.palette.p2, MediFlow.charts.palette.p3, MediFlow.charts.palette.p4];
      var anyData = values.some(function (value) { return value > 0; });

      return {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, font: { size: 11 } } },
            tooltip: {
              backgroundColor: 'rgba(6,41,79,.94)', cornerRadius: 8,
              callbacks: {
                label: function (context) {
                  var total = values.reduce(function (sum, value) { return sum + value; }, 0) || 1;
                  return context.label + ': ' + context.parsed + ' (' + U.percent(context.parsed, total) + '%)';
                }
              }
            }
          }
        },
        fallbackHtml: anyData
          ? MediFlow.charts.renderBarList(labels.map(function (label, index) {
              return { label: label, value: values[index], color: colors[index] };
            }), { emptyText: 'No active patients yet.' })
          : '<p class="muted small center">No active patients yet.</p>'
      };
    });
  }

  function update(root) {
    var view = MediFlow.router.renderInto(root, render());
    if (view) mount(view);
  }

  return { meta: meta, render: render, mount: mount, update: update };
})();

/* -------------------------------------------------------------------------
   MediFlow.actions – operations shared by several pages (demo data, exports)
   ------------------------------------------------------------------------- */
MediFlow.actions = (function () {
  'use strict';

  var U = MediFlow.utils;
  var ui = MediFlow.ui;

  function loadDemoData() {
    var described = MediFlow.demo.describe();
    ui.confirm({
      title: 'Load fictional demo patients?',
      subtitle: described.count + ' invented records',
      icon: 'i-database',
      confirmLabel: 'Load demo data',
      message: '<div class="alert alert--info">' + U.icon('i-shield') +
        '<div><strong>These are fictional demonstration records</strong>' +
        '<p>No real patient information is used. Each record is labelled DEMO throughout the application and a banner stays visible while demo data is loaded.</p>' +
        '<p class="small mt-1">' + described.critical + ' critical · ' + described.high + ' high priority · ' +
        described.moderate + ' moderate · ' + described.routine + ' routine · ' + described.pending + ' awaiting triage</p></div></div>',
      fields: [{
        name: 'staff',
        label: 'Loaded by',
        type: 'text',
        value: MediFlow.views.shared.currentStaff()
      }]
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.addDemoPatients(MediFlow.demo.build());
      if (!result.ok || !result.added.length) {
        ui.toast.error('Demo data not loaded', 'The store rejected every demo record. Please check the browser console.');
        return;
      }
      ui.toast.success(result.added.length + ' demo patients loaded',
        'The queue, dashboard and analytics now include fictional records clearly marked as demo data.');
    });
  }

  function resetDemoData() {
    var demoCount = MediFlow.store.all().filter(function (p) { return p.demo; }).length;
    if (!demoCount) {
      ui.toast.info('Nothing to reset', 'No demo records are currently loaded.');
      return;
    }
    ui.confirm({
      title: 'Remove all demo records?',
      subtitle: demoCount + ' demo patient(s) will be deleted',
      icon: 'i-trash',
      iconTone: 'red',
      tone: 'danger',
      confirmLabel: 'Remove demo data',
      message: '<div class="alert alert--danger">' + U.icon('i-warning') +
        '<div><strong>This deletes only the fictional demo records.</strong>' +
        '<p>Patients you registered yourself are kept. This cannot be undone.</p></div></div>'
    }).then(function (values) {
      if (!values) return;
      var result = MediFlow.store.clearDemo();
      ui.toast.warn('Demo data removed', result.removed + ' fictional patient record(s) deleted. Other records were kept.');
    });
  }

  function clearEverything() {
    var total = MediFlow.store.all().length;
    ui.confirm({
      title: 'Delete every patient record?',
      subtitle: 'This affects ' + total + ' record(s)',
      icon: 'i-trash',
      iconTone: 'red',
      tone: 'danger',
      confirmLabel: 'Delete everything',
      message: '<div class="alert alert--danger">' + U.icon('i-alert') +
        '<div><strong>Irreversible data loss</strong>' +
        '<p>This clears the whole MediFlow database in this browser, including records you entered yourself. Export a backup first if you need to keep anything.</p></div></div>',
      fields: [{
        name: 'confirmText',
        label: 'Type DELETE to confirm',
        type: 'text',
        required: true,
        placeholder: 'DELETE'
      }],
      validate: function (values) {
        if (String(values.confirmText).trim().toUpperCase() !== 'DELETE') {
          return { confirmText: 'Type DELETE exactly to confirm this action.' };
        }
        return {};
      }
    }).then(function (values) {
      if (!values) return;
      MediFlow.store.clearAll();
      ui.toast.warn('All data cleared', 'MediFlow is now empty. You can load the demo data again at any time.');
      window.location.hash = '#/dashboard';
    });
  }

  return {
    loadDemoData: loadDemoData,
    resetDemoData: resetDemoData,
    clearEverything: clearEverything
  };
})();
