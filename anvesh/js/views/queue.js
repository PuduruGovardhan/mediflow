/* ==========================================================================
   MediFlow | js/views/queue.js
   --------------------------------------------------------------------------
   The live queue.

   Ordering rule (exactly as specified):
     Level 1 first, then Level 2, 3 and 4; inside one level the earliest
     registration is seen first. Patients whose priority has not been
     confirmed by staff are shown in a separate, prominent amber strip so
     they can never be hidden behind confirmed patients.

   Includes search, filters, sorting, manual refresh and long-wait monitoring.
   ========================================================================== */

window.MediFlow = window.MediFlow || {};
MediFlow.views = MediFlow.views || {};

MediFlow.views.queue = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;
  var ui = MediFlow.ui;
  var shared = MediFlow.views.shared;

  var meta = {
    name: 'queue',
    title: 'Live Queue',
    subtitle: 'Ordered by confirmed urgency, then by waiting time'
  };

  /* Filter state lives here so re-renders keep what the user chose. */
  var filters = { search: '', priority: '', department: '', status: '', sort: 'urgency' };

  function render() {
    var store = MediFlow.store;
    var all = store.all();

    if (!all.length) {
      return shared.pageHead({ icon: 'i-queue', title: 'Live queue', subtitle: 'No patient records exist yet.' }) +
        '<div class="card"><div class="card-body">' + ui.empty('i-queue', 'Nothing in the queue',
          'Register a patient or load the fictional demo patients to see the queue ordering in action.',
          '<a class="btn" href="#/register">' + U.icon('i-user-plus') + 'Register a patient</a>' +
          '<button class="btn btn--secondary" data-action="load-demo">' + U.icon('i-database') + 'Load demo patients</button>') +
        '</div></div>';
    }

    var activeQueue = store.activeQueue();
    var pending = store.pendingTriage();
    var longWaiters = store.longWaiters();
    var waitSettings = MediFlow.waiting.settings();
    var summary = MediFlow.waiting.summary(activeQueue);

    /* Base list depends on the status filter: active-only unless the user
       explicitly asks for completed or cancelled records. */
    var scope;
    if (filters.status && filters.status !== 'active') {
      scope = filters.status === 'everything' ? all.slice() : all.filter(function (p) { return p.status === filters.status; });
    } else {
      scope = store.active();
    }

    var filtered = shared.applyFilters(scope, filters);
    var bands = [1, 2, 3, 4].map(function (level) {
      return {
        level: level,
        info: cfg.PRIORITY_LEVELS[level],
        patients: filtered.filter(function (p) { return U.num(p.confirmedPriority, p.suggestedPriority) === level; })
      };
    });
    var unconfirmedInList = filtered.filter(function (p) { return U.num(p.confirmedPriority, null) === null; });

    var html = shared.pageHead({
      icon: 'i-queue',
      title: 'Live queue',
      subtitle: 'Level 1 patients appear first, then Level 2, 3 and 4. Inside one level the patient who registered earliest is seen first. This page recalculates itself after every change.',
      tools:
        '<a class="btn btn--secondary" href="#/analytics">' + U.icon('i-chart') + 'Analytics</a>' +
        '<button class="btn" data-action="refresh-queue">' + U.icon('i-refresh') + 'Refresh</button>'
    });

    /* --------------------------- summary strip ------------------------ */
    html += '<div class="stat-strip mb-2">' +
      '<div><dt>In queue now</dt><dd>' + summary.waitingCount + '</dd></div>' +
      '<div><dt>In consultation</dt><dd>' + summary.inConsultationCount + '</dd></div>' +
      bands.map(function (band) {
        return '<div><dt>' + U.esc(band.info.label) + ' ' + U.esc(band.info.short) + '</dt><dd>' + band.patients.length + '</dd></div>';
      }).join('') +
      '<div><dt>Avg wait (measured)</dt><dd>' + summary.averageWaitMinutes + '<span class="xsmall muted"> min</span></dd></div>' +
      '<div><dt>Long waits ≥' + waitSettings.longWaitMinutes + ' min</dt><dd>' + longWaiters.length + '</dd></div>' +
      '</div>';

    /* --------------------------- waiting estimate --------------------- */
    html += '<div class="alert alert--info mb-2">' + U.icon('i-clock') +
      '<div><strong>Illustrative queue estimate, not a promise</strong>' +
      '<p>The configured service durations add up to roughly <strong>' + summary.backlogMinutes + ' minutes of clinical work</strong> for the patients currently waiting, spread over ' +
      summary.roomCount + ' consultation ' + U.plural(summary.roomCount, 'room') +
      (summary.queueDrainMinutes ? ' — about ' + summary.queueDrainMinutes + ' minutes to clear if nothing else changed.' : '.') + ' ' +
      U.esc(cfg.DISCLAIMERS.wait) + '</p></div></div>';

    /* -------------------------- pending strip ------------------------- */
    if (pending.length) {
      html += '<div class="card mb-2" style="border:2px solid #fec84b">' +
        '<div class="card-head" style="background:var(--amber-050)">' +
          '<h3>' + U.icon('i-triage') + 'Awaiting triage confirmation <span class="badge badge--amber">' + pending.length + '</span></h3>' +
          '<div class="card-head-tools"><a class="btn btn--warn btn--sm" href="#/triage">' + U.icon('i-chevron-right', 'ico--sm') + 'Confirm on triage page</a></div>' +
        '</div>' +
        '<div class="card-body card-body--tight">' +
          '<p class="small muted mb-1">These patients are registered but no member of staff has confirmed their priority yet, so they are held out of the ordered queue. Review them now.</p>' +
          '<div class="table-wrap"><table class="data"><tbody>' + pending.map(function (patient) {
            return '<tr class="row--p' + U.num(patient.suggestedPriority, 4) + '">' +
              '<td><span class="pid">' + U.esc(patient.id) + '</span> ' + ui.demoBadge(patient.demo) + ui.reviewBadge(patient) + '</td>' +
              '<td><div class="cell-stack"><strong>' + U.esc(patient.name) + '</strong><span>' + U.esc(String(patient.age)) + ' yrs · ' + U.esc(patient.department) + '</span></div></td>' +
              '<td>' + shared.symptomsCell(patient, { max: 70 }) + '</td>' +
              '<td>' + (U.num(patient.suggestedPriority, null) ? ui.priorityBadge(patient.suggestedPriority, { soft: true }) : '') + '</td>' +
              '<td class="nowrap">' + shared.waitPill(patient) + '</td>' +
              '<td class="nowrap"><div class="cell-actions">' +
                '<button class="btn btn--sm" data-action="priority" data-id="' + U.attr(patient.id) + '">' + U.icon('i-check', 'ico--sm') + 'Confirm priority</button>' +
                '<button class="btn btn--secondary btn--sm" data-action="open" data-id="' + U.attr(patient.id) + '">Open</button>' +
              '</div></td></tr>';
          }).join('') + '</tbody></table></div>' +
        '</div></div>';
    }

    /* ----------------------------- filters ---------------------------- */
    html += '<div class="card mb-2"><div class="card-body card-body--tight">' +
      '<div class="filters">' +
        '<div class="field"><label for="q-search">' + U.icon('i-search', 'ico--sm') + 'Search</label>' +
          '<input id="q-search" type="search" placeholder="Patient name, ID, symptom or department" value="' + U.attr(filters.search) + '" />' +
        '</div>' +
        '<div class="field"><label for="q-priority">Priority</label><select id="q-priority">' +
          option('', 'All priorities', filters.priority) +
          [1, 2, 3, 4].map(function (level) {
            var info = cfg.PRIORITY_LEVELS[level];
            return option(String(level), info.label + ' – ' + info.name, filters.priority);
          }).join('') +
          option('unconfirmed', 'Awaiting confirmation', filters.priority) +
        '</select></div>' +
        '<div class="field"><label for="q-department">Department</label><select id="q-department">' +
          option('', 'All departments', filters.department) +
          cfg.DEPARTMENTS.map(function (name) { return option(name, name, filters.department); }).join('') +
        '</select></div>' +
        '<div class="field"><label for="q-status">Status</label><select id="q-status">' +
          option('active', 'All active patients', filters.status || 'active') +
          Object.keys(cfg.STATUSES).map(function (key) {
            return option(key, cfg.STATUSES[key].label, filters.status);
          }).join('') +
          option('everything', 'Everything (including cancelled)', filters.status) +
        '</select></div>' +
        '<div class="field"><label for="q-sort">Sort by</label><select id="q-sort">' +
          option('urgency', 'Urgency, then oldest first', filters.sort) +
          option('wait-longest', 'Longest waiting first', filters.sort) +
          option('wait-shortest', 'Most recently registered first', filters.sort) +
          option('name', 'Patient name (A–Z)', filters.sort) +
          option('id', 'Patient ID', filters.sort) +
        '</select></div>' +
        '<div class="field"><label>&nbsp;</label><button class="btn btn--secondary" data-action="clear-filters">' + U.icon('i-close') + 'Clear filters</button></div>' +
      '</div>' +
      '<p class="small muted mt-1" id="queue-summary" data-shown="' + filtered.length + '" data-scope="' + scope.length + '">' +
        'Showing <strong>' + filtered.length + '</strong> of ' + scope.length + ' patient(s) in this view. Filters also apply to the priority bands below.' +
      '</p>' +
      '</div></div>';

    /* --------------------- long-wait monitoring ----------------------- */
    if (longWaiters.length) {
      html += '<div class="alert alert--warn mb-2">' + U.icon('i-warning') +
        '<div><strong>' + longWaiters.length + ' patient(s) have been waiting ' + waitSettings.longWaitMinutes + ' minutes or more</strong>' +
        '<p>MediFlow never lets a routine patient disappear. Reassess them to keep the queue clinically safe:</p>' +
        '<div class="chip-row mt-1">' + longWaiters.slice(0, 10).map(function (patient) {
          return '<span class="chip chip--amber">' + U.icon('i-clock') + U.esc(patient.id + ' · ' + patient.name) +
            ' · ' + U.esc(U.durationLabel(patient.registeredAt)) + '</span>' +
            '<button class="btn btn--warn btn--sm" data-action="reassess" data-id="' + U.attr(patient.id) + '">Reassess</button>';
        }).join('') + '</div></div></div>';
    }

    /* --------------------------- priority bands ----------------------- */
    if (!filtered.length) {
      html += '<div class="card"><div class="card-body">' + ui.empty('i-search', 'No patients match these filters',
        'Try clearing the search box or widening the priority, department and status filters.',
        '<button class="btn btn--secondary" data-action="clear-filters">' + U.icon('i-close') + 'Clear filters</button>') +
        '</div></div>';
    } else if (filters.sort === 'urgency' && !filters.priority) {
      var offset = 0;
      bands.forEach(function (band) {
        if (!band.patients.length) return;
        html += bandBlock(band, offset);
        offset += band.patients.length;
      });
      if (unconfirmedInList.length) {
        html += '<div class="card mt-2"><div class="card-head" style="background:var(--amber-050)">' +
          '<h3>' + U.icon('i-warning') + 'Awaiting confirmation included in this view</h3></div><div class="card-body card-body--tight">' +
          shared.queueTable(unconfirmedInList, { showPosition: false, positionOffset: offset, showStatus: true }) +
          '</div></div>';
      }
    } else {
      html += '<div class="card"><div class="card-head"><h3>' + U.icon('i-sort') + 'Filtered results</h3>' +
        '<div class="card-head-tools"><span class="badge badge--neutral">' + filtered.length + ' patient(s)</span></div></div>' +
        '<div class="card-body card-body--tight">' +
        shared.queueTable(filtered, { showPosition: true, caption: 'Sorted by ' + sortLabel(filters.sort) + '.' }) +
        '</div></div>';
    }

    return html;
  }

  function bandBlock(band, offset) {
    var info = band.info;
    return '<div class="card mt-2" style="border-left:6px solid var(--p' + band.level + ')">' +
      '<div class="card-head">' +
        '<h3><span class="badge badge--p' + band.level + '">' + U.esc(info.label) + '</span> ' + U.esc(info.name) + '</h3>' +
        '<div class="card-head-tools">' +
          '<span class="badge badge--neutral">' + band.patients.length + ' patient(s)</span>' +
          '<span class="small muted">' + U.esc(info.action) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="card-body card-body--tight">' +
      shared.queueTable(band.patients, {
        showPosition: true,
        positionOffset: offset,
        caption: band.patients.length + ' patient(s) at ' + info.label + ' — oldest registration first. ' + info.description
      }) +
      '</div></div>';
  }

  function option(value, label, selected) {
    return '<option value="' + U.attr(value) + '"' + (String(selected) === String(value) ? ' selected' : '') + '>' + U.esc(label) + '</option>';
  }

  function sortLabel(sort) {
    var labels = {
      urgency: 'urgency then waiting time',
      'wait-longest': 'longest waiting first',
      'wait-shortest': 'most recently registered first',
      name: 'patient name',
      id: 'patient ID'
    };
    return labels[sort] || 'urgency';
  }

  function mount(root) {
    shared.bindPatientActions(root);

    var search = U.$('#q-search', root);
    var priority = U.$('#q-priority', root);
    var department = U.$('#q-department', root);
    var status = U.$('#q-status', root);
    var sort = U.$('#q-sort', root);

    /* Filtering re-renders only the list part by re-rendering the page; the
       filter values live in module state so nothing is lost. */
    function apply() {
      filters.search = search ? search.value : '';
      filters.priority = priority ? priority.value : '';
      filters.department = department ? department.value : '';
      filters.status = status ? status.value : 'active';
      filters.sort = sort ? sort.value : 'urgency';
      MediFlow.router.refresh();
    }

    var debouncedApply = U.debounce(apply, 220);
    if (search) search.addEventListener('input', debouncedApply);
    [priority, department, status, sort].forEach(function (node) {
      if (node) node.addEventListener('change', apply);
    });

    U.on(root, 'click', '[data-action="refresh-queue"]', function () {
      ui.toast.info('Queue refreshed', 'Re-ordered at ' + U.timeLabel(new Date()) + ' using the latest stored records.');
      MediFlow.router.refresh();
    });

    U.on(root, 'click', '[data-action="clear-filters"]', function () {
      filters = { search: '', priority: '', department: '', status: 'active', sort: 'urgency' };
      ui.toast.info('Filters cleared', 'Showing every active patient in urgency order.');
      MediFlow.router.refresh();
    });

    U.on(root, 'click', '[data-action="load-demo"]', function () { MediFlow.actions.loadDemoData(); });
  }

  function update(root) {
    if (!root || !root.querySelector('#q-search')) return;   /* nothing rendered yet */

    /* Typing in the search box re-renders the page, so put the caret back
       where the user left it. Without this the box would lose focus. */
    var active = document.activeElement;
    var restoreId = active && root.contains(active) && active.id ? active.id : null;
    var caret = null;
    try { caret = active && active.selectionStart; } catch (error) { caret = null; }

    var fresh = MediFlow.router.renderInto(root, render());
    if (!fresh) return;
    mount(fresh);

    if (restoreId) {
      var node = fresh.querySelector('#' + restoreId);
      if (node && node.focus) {
        node.focus();
        if (caret !== null && caret !== undefined && node.setSelectionRange) {
          try { node.setSelectionRange(caret, caret); } catch (error) { /* not a text input */ }
        }
      }
    }
  }

  /** Reset the filters (used by the router when leaving the page). */
  function reset() { filters = { search: '', priority: '', department: '', status: 'active', sort: 'urgency' }; }

  return { meta: meta, render: render, mount: mount, update: update, reset: reset };
})();
