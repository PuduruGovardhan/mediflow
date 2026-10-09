/* ==========================================================================
   MediFlow | js/app.js
   --------------------------------------------------------------------------
   Application bootstrap.

   Responsibilities
     * start the store (load from storage)
     * register every view with the router
     * render the shared chrome: mobile navigation, demo banner, emergency
       alert banner, sidebar counters, footer summary, clock, staff chip
     * keep that chrome in sync whenever the data changes
     * surface unexpected errors as a message instead of a blank page
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.app = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;
  var ui = MediFlow.ui;

  /* ---------------------------------------------------------------------
     Chrome
     --------------------------------------------------------------------- */

  function refreshChrome() {
    var store = MediFlow.store;
    var counts = store.counts();
    var settings = store.settings || {};

    /* Sidebar counters */
    var queueCount = U.$('#nav-queue-count');
    if (queueCount) {
      var activeCount = store.activeQueue().length;
      queueCount.textContent = activeCount;
      queueCount.hidden = activeCount === 0;
    }
    var triageCount = U.$('#nav-triage-count');
    if (triageCount) {
      var pending = store.pendingTriage().length;
      triageCount.textContent = pending;
      triageCount.hidden = pending === 0;
    }

    /* Staff chip */
    var avatar = U.$('#staff-avatar');
    if (avatar) avatar.textContent = U.clean(settings.staffInitials || U.initials(settings.staffName), 3).toUpperCase() || 'MF';
    var staffName = U.$('#staff-name');
    if (staffName) staffName.textContent = U.clean(settings.staffName, 40) || 'Staff member';
    var staffRole = U.$('.staff-meta small');
    if (staffRole) staffRole.textContent = (U.clean(settings.staffRole, 40) || 'Clinical staff') + ' · Demo shift';

    /* Build tag */
    var buildTag = U.$('#build-tag');
    if (buildTag) buildTag.textContent = cfg.APP.name + ' v' + cfg.APP.version + ' · ' + cfg.APP.build;

    /* Footer summary */
    var foot = U.$('#foot-queue-summary');
    if (foot) {
      var summary = MediFlow.waiting.summary(store.activeQueue());
      foot.textContent = counts.total + ' record(s) · ' + summary.waitingCount + ' waiting · ' +
        counts.urgent + ' urgent · avg wait ' + summary.averageWaitMinutes + ' min (measured) · ' +
        (MediFlow.storage.status().persistent ? 'saved in this browser' : 'session memory only');
    }

    renderDemoBanner(counts);
    renderEmergencyBanners();
  }

  function renderDemoBanner(counts) {
    var host = U.$('#demo-host');
    if (!host) return;
    if (!counts.demo) {
      if (host.dataset.state !== 'hidden') { host.innerHTML = ''; host.dataset.state = 'hidden'; }
      return;
    }
    var signature = 'demo-' + counts.demo;
    if (host.dataset.state === signature) return;
    host.dataset.state = signature;
    host.innerHTML = '<div class="demo-banner">' + U.icon('i-database') +
      '<span><strong>Demo mode:</strong> ' + counts.demo + ' fictional patient record(s) are loaded. ' +
      U.esc(cfg.DISCLAIMERS.demo) + '</span>' +
      '<button class="btn btn--secondary btn--sm" data-action="remove-demo">' + U.icon('i-trash', 'ico--sm') + 'Remove demo data</button>' +
      '</div>';
  }

  /**
   * The prominent emergency alert required by the brief: a Level 1 patient
   * must be visible from any page until a member of staff acknowledges it.
   */
  function renderEmergencyBanners() {
    var host = U.$('#alert-host');
    if (!host) return;
    var alerts = MediFlow.store.criticalAlerts();
    var signature = alerts.map(function (p) { return p.id + ':' + p.status; }).join(',');
    if (host.dataset.state === signature) return;
    host.dataset.state = signature;

    if (!alerts.length) { host.innerHTML = ''; return; }

    var first = alerts[0];
    var extra = alerts.length > 1
      ? '<p><strong>' + (alerts.length - 1) + ' further critical patient(s):</strong> ' +
        alerts.slice(1, 5).map(function (p) { return U.esc(p.id + ' – ' + p.name); }).join(', ') +
        (alerts.length > 5 ? ' …' : '') + '</p>'
      : '';

    host.innerHTML = '<div class="emergency-alert" role="alert">' +
      '<span class="emergency-alert__icon">' + U.icon('i-alert') + '</span>' +
      '<div class="emergency-alert__body">' +
        '<h2>' + U.icon('i-warning') + 'EMERGENCY — critical warning sign reported' +
          ' <span class="badge badge--p1">Level 1 Critical</span></h2>' +
        '<p><strong>' + U.esc(first.id + ' · ' + first.name) + '</strong> (' + U.esc(String(first.age)) + ' yrs, ' +
          U.esc(first.department) + ', waiting ' + U.esc(U.durationLabel(first.registeredAt)) + ')' +
          (first.symptomDuration ? ', symptoms for ' + U.esc(first.symptomDuration) : '') + '.</p>' +
        '<p>' + U.esc(U.clean(first.symptoms, 180)) + '</p>' +
        '<p><strong>Seek immediate clinical assessment now. Do not delay emergency care while completing registration.</strong></p>' +
        extra +
        '<div class="emergency-alert__actions">' +
          '<a class="btn btn--danger" href="#/patient/' + U.attr(first.id) + '">' + U.icon('i-eye') + 'Open patient</a>' +
          '<button class="btn btn--secondary" data-action="dismiss-alert" data-id="' + U.attr(first.id) + '">' +
            U.icon('i-check') + 'Acknowledge alert</button>' +
          (alerts.length > 1 ? '<a class="btn btn--warn" href="#/queue">' + U.icon('i-queue') + 'See all critical patients</a>' : '') +
        '</div>' +
      '</div></div>';
  }

  /* ---------------------------------------------------------------------
     Navigation, shortcuts and global wiring
     --------------------------------------------------------------------- */

  function wireNavigation() {
    var menuBtn = U.$('#menu-btn');
    var scrim = U.$('#scrim');

    function setNav(open) {
      document.body.classList.toggle('nav-open', open);
      if (scrim) scrim.hidden = !open;
      if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    if (menuBtn) menuBtn.addEventListener('click', function () {
      setNav(!document.body.classList.contains('nav-open'));
    });
    if (scrim) scrim.addEventListener('click', function () { setNav(false); });

    /* Close the drawer after choosing a page on a small screen. */
    U.$$('.nav-item').forEach(function (item) {
      item.addEventListener('click', function () { setNav(false); });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && document.body.classList.contains('nav-open')) setNav(false);
      /* "/" jumps to the queue search box when the queue page is open. */
      if (event.key === '/' && document.activeElement === document.body && MediFlow.router.currentName() === 'queue') {
        var search = U.$('#q-search');
        if (search) { event.preventDefault(); search.focus(); }
      }
    });

    /* Global delegated handler for buttons rendered by app-level banners. */
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action]');
      if (!button || !document.body.contains(button)) return;
      var action = button.getAttribute('data-action');
      if (action === 'remove-demo') MediFlow.actions.resetDemoData();
    });
  }

  /* ---------------------------------------------------------------------
     Start
     --------------------------------------------------------------------- */

  function start() {
    /* 1. Load the data */
    MediFlow.store.init();

    /* 2. Register the views with the router */
    MediFlow.router.define([
      MediFlow.views.dashboard,
      MediFlow.views.register,
      MediFlow.views.queue,
      MediFlow.views.patient,
      MediFlow.views.triage,
      MediFlow.views.analytics,
      MediFlow.views.settings
    ]);

    /* 3. Shared UI */
    ui.startClock();
    wireNavigation();
    refreshChrome();

    /* 4. Any data change refreshes the chrome, then the page itself. */
    MediFlow.store.subscribe(function () {
      refreshChrome();
      MediFlow.router.refresh();
    });

    /* 5. Go */
    MediFlow.router.start();

    /* 6. Friendly message if storage could not be used */
    var storage = MediFlow.storage.status();
    if (!storage.persistent) {
      ui.toast({ type: 'warn', title: 'Storage unavailable', message: storage.message, timeout: 12000 });
    }

    var counts = MediFlow.store.counts();
    if (counts.total) {
      ui.toast.info('MediFlow ready',
        counts.total + ' patient record(s) restored · ' + MediFlow.store.activeQueue().length + ' in the live queue.');
    }
  }

  /* Surface unexpected errors instead of leaving a blank screen. */
  window.addEventListener('error', function (event) {
    if (window.console && console.error) console.error('[MediFlow] unexpected error', event.error || event.message);
    if (event.message && String(event.message).indexOf('Script error') === 0) return;
  });

  window.addEventListener('unhandledrejection', function (event) {
    if (window.console && console.error) console.error('[MediFlow] unhandled promise rejection', event.reason);
  });

  /* Boot when the DOM is ready. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  return {
    start: start,
    refreshChrome: refreshChrome,
    renderEmergencyBanners: renderEmergencyBanners
  };
})();
