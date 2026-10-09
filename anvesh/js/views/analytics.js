/* ==========================================================================
   MediFlow | js/views/analytics.js
   --------------------------------------------------------------------------
   Analytics. Every number is computed from the records in this browser, and
   the charts are rebuilt after every change.

   Honesty rules applied here:
     * Figures that come from the fictional demo dataset are labelled, and a
       banner says so whenever demo records are present.
     * Waiting figures are labelled either "measured" or "illustrative
       estimate" – never presented as a clinical prediction.
     * Nothing on this page claims to be real hospital performance data.
   ========================================================================== */

window.MediFlow = window.MediFlow || {};
MediFlow.views = MediFlow.views || {};

MediFlow.views.analytics = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;
  var ui = MediFlow.ui;
  var shared = MediFlow.views.shared;

  var meta = {
    name: 'analytics',
    title: 'Analytics',
    subtitle: 'Flow, urgency and throughput from the stored records'
  };

  function render() {
    var store = MediFlow.store;
    var patients = store.all();
    var today = U.startOfDay(new Date());

    if (!patients.length) {
      return shared.pageHead({ icon: 'i-chart', title: 'Analytics', subtitle: 'No data to analyse yet.' }) +
        '<div class="card"><div class="card-body">' +
        ui.empty('i-chart', 'No records to analyse',
          'Register patients or load the fictional demo patients to populate these charts.',
          '<button class="btn" data-action="load-demo">' + U.icon('i-database') + 'Load demo patients</button>' +
          '<a class="btn btn--secondary" href="#/register">' + U.icon('i-user-plus') + 'Register a patient</a>') +
        '</div></div>';
    }

    var stats = store.stats();
    var byLevelAll = { 1: 0, 2: 0, 3: 0, 4: 0 };
    var byLevelToday = { 1: 0, 2: 0, 3: 0, 4: 0 };
    var waiting = 0, inConsult = 0, completed = 0, reassessment = 0, cancelled = 0;
    var demoCount = 0;
    var departmental = {};
    var seen = 0;

    patients.forEach(function (patient) {
      if (patient.demo) demoCount++;
      var level = U.num(patient.confirmedPriority, null);
      if (level === null) level = U.num(patient.suggestedPriority, null);
      if (level && byLevelAll[level] !== undefined) {
        byLevelAll[level]++;
        if (U.toDate(patient.registeredAt) >= today) byLevelToday[level]++;
      }
      if (patient.status === 'waiting') waiting++;
      else if (patient.status === 'in_consultation') inConsult++;
      else if (patient.status === 'completed') completed++;
      else if (patient.status === 'reassessment') reassessment++;
      else if (patient.status === 'cancelled') cancelled++;
      if (patient.seenAt) seen++;

      var dept = patient.department || 'Unassigned';
      departmental[dept] = departmental[dept] || { total: 0, active: 0 };
      departmental[dept].total++;
      if (store.isActive(patient)) departmental[dept].active++;
    });

    var registeredToday = patients.filter(function (p) { return U.toDate(p.registeredAt) >= today; }).length;
    var completedToday = patients.filter(function (p) { return p.completedAt && U.toDate(p.completedAt) >= today; }).length;
    var averageMeasured = store.averageMeasuredWait(patients);
    var waitSettings = MediFlow.waiting.settings();
    var queueSummary = MediFlow.waiting.summary(store.activeQueue());
    var throughput = store.throughputByHour(new Date());
    var throughputTotal = throughput.reduce(function (sum, hour) { return sum + hour.count; }, 0);
    var busiest = throughput.reduce(function (top, hour) { return hour.count > top.count ? hour : top; }, throughput[0]);

    var html = shared.pageHead({
      icon: 'i-chart',
      title: 'Analytics',
      subtitle: 'Everything here is calculated from the patient records stored in this browser and updates automatically when records change.',
      tools: '<a class="btn btn--secondary" href="#/queue">' + U.icon('i-queue') + 'Live queue</a>' +
        '<button class="btn" data-action="refresh-analytics">' + U.icon('i-refresh') + 'Recalculate</button>'
    });

    if (demoCount) {
      html += '<div class="alert alert--warn mb-2">' + U.icon('i-database') +
        '<div><strong>Simulated statistics — ' + demoCount + ' of ' + patients.length + ' records are fictional demo data</strong>' +
        '<p>These figures demonstrate how MediFlow behaves. They are not real hospital results and must never be presented as such. Remove the demo records in Settings to see figures based only on records you entered.</p></div></div>';
    }

    /* --------------------------- KPI strip ---------------------------- */
    html += '<div class="stat-strip mb-2">' +
      '<div><dt>Registered today</dt><dd>' + registeredToday + '</dd></div>' +
      '<div><dt>Completed today</dt><dd>' + completedToday + '</dd></div>' +
      '<div><dt>Currently waiting</dt><dd>' + (stats.counts.waiting + stats.counts.reassessment) + '</dd></div>' +
      '<div><dt>In consultation</dt><dd>' + inConsult + '</dd></div>' +
      '<div><dt>Avg wait measured</dt><dd>' + averageMeasured + '<span class="xsmall muted"> min</span></dd></div>' +
      '<div><dt>Consultations recorded</dt><dd>' + seen + '</dd></div>' +
      '</div>';

    html += '<div class="alert alert--info mb-2">' + U.icon('i-clock') +
      '<div><strong>Measured vs estimated waiting time</strong>' +
      '<p><strong>Measured</strong> waiting time is calculated from real timestamps: registration → first clinical contact, for the patients who have already been seen. ' +
      '<strong>Estimated</strong> waiting time is the illustrative arithmetic model (' + waitSettings.consultRooms + ' rooms, configured service durations) and is currently showing roughly ' +
      queueSummary.queueDrainMinutes + ' minutes to clear the queue. ' + U.esc(cfg.DISCLAIMERS.wait) + '</p></div></div>';

    /* ----------------------------- charts ----------------------------- */
    html += '<div class="grid grid--2 mb-2">' +
      chartCard('chart-urgency', 'Patients by urgency level',
        'All records. Levels are the staff-confirmed priority where it exists, otherwise the provisional suggestion.') +
      chartCard('chart-department', 'Patients by department',
        'Total registrations per department, with the number still active shown in the table below.') +
      '</div>';

    html += '<div class="grid grid--2 mb-2">' +
      chartCard('chart-status', 'Patient flow status',
        'Where every registered patient currently sits in the flow: waiting, in consultation, reassessment, completed or cancelled.') +
      chartCard('chart-throughput', 'Consultation throughput today',
        'Number of patients whose first clinical contact happened in each hour of today (' + throughputTotal + ' so far' +
        (throughputTotal ? ', busiest hour ' + busiest.label : '') + ').') +
      '</div>';

    /* ------------------------- level breakdown ------------------------ */
    html += '<div class="card mb-2"><div class="card-head"><h3>' + U.icon('i-chart') + 'Breakdown by priority level</h3></div>' +
      '<div class="card-body card-body--tight"><div class="table-wrap"><table class="data">' +
      '<caption>How the workload is distributed across the four provisional levels, using the current records.</caption>' +
      '<thead><tr><th scope="col">Level</th><th scope="col">Total</th><th scope="col">Registered today</th>' +
      '<th scope="col">Now in queue</th><th scope="col">Avg measured wait</th><th scope="col">Illustrative service time</th></tr></thead>' +
      '<tbody>' + [1, 2, 3, 4].map(function (level) {
        var info = cfg.PRIORITY_LEVELS[level];
        var inQueue = store.activeQueue().filter(function (p) { return p.confirmedPriority === level; }).length;
        var levelPatients = patients.filter(function (p) {
          var lvl = U.num(p.confirmedPriority, U.num(p.suggestedPriority, null));
          return lvl === level;
        });
        var avgWait = store.averageMeasuredWait(levelPatients);
        return '<tr class="row--p' + level + '">' +
          '<td>' + ui.priorityBadge(level, { long: true }) + '</td>' +
          '<td class="num strong">' + byLevelAll[level] + '</td>' +
          '<td class="num">' + byLevelToday[level] + '</td>' +
          '<td class="num">' + inQueue + '</td>' +
          '<td class="num">' + (avgWait ? avgWait + ' min' : '—') + '</td>' +
          '<td class="num">' + waitSettings.serviceMinutes[level] + ' min</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div></div></div>';

    /* ----------------------- department table ------------------------- */
    html += '<div class="card mb-2"><div class="card-head"><h3>' + U.icon('i-pin') + 'Department pressure</h3>' +
      '<div class="card-head-tools"><span class="small muted">Active patients are the ones still in the flow</span></div></div>' +
      '<div class="card-body">' +
      '<div class="bar-list">' + Object.keys(departmental).sort(function (a, b) {
        return departmental[b].total - departmental[a].total;
      }).map(function (name) {
        var data = departmental[name];
        var width = U.percent(data.total, patients.length);
        return '<div class="bar-list-row">' +
          '<span class="bl-name" title="' + U.attr(name) + '">' + U.esc(name) + '</span>' +
          '<span class="progress"><span style="width:' + Math.max(3, width) + '%"></span></span>' +
          '<span class="bl-val">' + data.total + ' <span class="xsmall muted">(' + data.active + ' active)</span></span>' +
          '</div>';
      }).join('') + '</div>' +
      '</div></div>';

    /* --------------------------- flow summary -------------------------- */
    html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-trending') + 'Flow summary</h3></div>' +
      '<div class="card-body"><dl class="dl">' +
        '<dt>Waiting versus completed</dt><dd><strong>' + waiting + '</strong> waiting · <strong>' + completed + '</strong> completed · ' +
          reassessment + ' flagged for reassessment · ' + cancelled + ' cancelled</dd>' +
        '<dt>Consultation throughput</dt><dd><strong>' + seen + '</strong> patients have had a first clinical contact; ' +
          completedToday + ' consultations were completed today.</dd>' +
        '<dt>Average measured wait</dt><dd><strong>' + averageMeasured + ' minutes</strong> from registration to first clinical contact, across the ' + seen + ' patients already seen.</dd>' +
        '<dt>Illustrative queue estimate</dt><dd>' + queueSummary.queueDrainMinutes + ' minutes to clear the current queue with ' + waitSettings.consultRooms + ' consultation rooms. <span class="muted small">Estimate only.</span></dd>' +
        '<dt>Longest current wait</dt><dd>' + (queueSummary.longestWait
          ? U.esc(queueSummary.longestWait.patient.name) + ' (' + U.esc(queueSummary.longestWait.patient.id) + ') — ' + U.durationLabel(queueSummary.longestWait.patient.registeredAt)
          : 'Nobody is waiting.') + '</dd>' +
        '<dt>Records</dt><dd>' + patients.length + ' total · ' + demoCount + ' demo (fictional) · ' + (patients.length - demoCount) + ' entered by staff</dd>' +
      '</dl>' +
      '<div class="alert alert--info mt-2">' + U.icon('i-shield') +
        '<div><strong>Prototype analytics</strong><p>' + U.esc(cfg.DISCLAIMERS.prototype) + ' In a real deployment these figures would come from the hospital information system with proper audit and anonymisation.</p></div></div>' +
      '</div></div>';

    return html;
  }

  function chartCard(id, title, description) {
    return '<div class="card"><div class="card-head"><h3>' + U.icon('i-chart') + U.esc(title) + '</h3></div>' +
      '<div class="card-body"><div class="chart-box"><canvas id="' + id + '" role="img" aria-label="' + U.attr(title) + '"></canvas>' +
      '<div class="chart-fallback"></div></div>' +
      '<p class="small muted mt-1">' + U.esc(description) + '</p></div></div>';
  }

  /* ---------------------------------------------------------------------
     Charts
     --------------------------------------------------------------------- */

  function registerCharts() {
    MediFlow.charts.register('chart-urgency', function () {
      var counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
      MediFlow.store.all().forEach(function (patient) {
        var level = U.num(patient.confirmedPriority, U.num(patient.suggestedPriority, null));
        if (level && counts[level] !== undefined) counts[level]++;
      });
      var labels = [1, 2, 3, 4].map(function (level) { return 'L' + level + ' ' + cfg.PRIORITY_LEVELS[level].name; });
      var values = [counts[1], counts[2], counts[3], counts[4]];
      var colors = [MediFlow.charts.palette.p1, MediFlow.charts.palette.p2, MediFlow.charts.palette.p3, MediFlow.charts.palette.p4];
      return {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Patients', data: values, backgroundColor: colors, borderRadius: 6, maxBarThickness: 62 }] },
        options: MediFlow.charts.baseOptions({ plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(6,41,79,.94)', cornerRadius: 8 } } }),
        fallbackHtml: MediFlow.charts.fallbackFromLabels(labels, values, colors)
      };
    });

    MediFlow.charts.register('chart-department', function () {
      var grouped = MediFlow.store.byDepartment();
      var names = Object.keys(grouped).sort(function (a, b) { return grouped[b] - grouped[a]; }).slice(0, 8);
      if (!names.length) return null;
      var values = names.map(function (name) { return grouped[name]; });
      return {
        type: 'bar',
        data: {
          labels: names,
          datasets: [{ label: 'Active patients', data: values, backgroundColor: MediFlow.charts.palette.blue, borderRadius: 6, maxBarThickness: 44 }]
        },
        options: MediFlow.charts.baseOptions({
          indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(6,41,79,.94)', cornerRadius: 8 } },
          scales: { x: { beginAtZero: true, grid: { color: MediFlow.charts.palette.grid }, ticks: { precision: 0 } }, y: { grid: { display: false } } }
        }),
        fallbackHtml: MediFlow.charts.fallbackFromLabels(names, values, names.map(function () { return MediFlow.charts.palette.blue; }))
      };
    });

    MediFlow.charts.register('chart-status', function () {
      var counts = MediFlow.store.byStatus();
      var keys = ['waiting', 'in_consultation', 'reassessment', 'completed', 'cancelled'];
      var labels = keys.map(function (key) { return cfg.STATUSES[key].label; });
      var values = keys.map(function (key) { return counts[key] || 0; });
      var colors = ['#0b6bcb', '#109c92', '#dc6803', '#079455', '#94a3b8'];
      if (!values.some(function (value) { return value > 0; })) return null;
      return {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '55%',
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 12, usePointStyle: true, font: { size: 11 } } },
            tooltip: { backgroundColor: 'rgba(6,41,79,.94)', cornerRadius: 8 }
          }
        },
        fallbackHtml: MediFlow.charts.fallbackFromLabels(labels, values, colors)
      };
    });

    MediFlow.charts.register('chart-throughput', function () {
      var hours = MediFlow.store.throughputByHour(new Date());
      var start = 6;
      var end = 22;
      var slice = hours.slice(start, end + 1);
      var labels = slice.map(function (hour) { return hour.label; });
      var values = slice.map(function (hour) { return hour.count; });
      var anyData = values.some(function (value) { return value > 0; });
      return {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Consultations started',
            data: values,
            borderColor: MediFlow.charts.palette.teal,
            backgroundColor: 'rgba(16,156,146,.16)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: MediFlow.charts.palette.teal
          }]
        },
        options: MediFlow.charts.baseOptions({ plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(6,41,79,.94)', cornerRadius: 8 } } }),
        fallbackHtml: anyData
          ? MediFlow.charts.fallbackFromLabels(labels, values, labels.map(function () { return MediFlow.charts.palette.teal; }))
          : '<p class="muted small center">No consultations have started today yet.</p>'
      };
    });
  }

  function mount(root) {
    registerCharts();
    MediFlow.charts.rebuildAll();
    shared.bindPatientActions(root);

    U.on(root, 'click', '[data-action="refresh-analytics"]', function () {
      ui.toast.info('Recalculated', 'Analytics were rebuilt from the stored records at ' + U.timeLabel(new Date()) + '.');
      MediFlow.router.refresh();
    });

    U.on(root, 'click', '[data-action="load-demo"]', function () { MediFlow.actions.loadDemoData(); });
  }

  function update(root) {
    var view = MediFlow.router.renderInto(root, render());
    if (view) mount(view);
  }

  return { meta: meta, render: render, mount: mount, update: update };
})();
