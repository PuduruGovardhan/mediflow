/* ==========================================================================
   MediFlow | js/router.js
   --------------------------------------------------------------------------
   Hash-based router. Every page is reachable by address and shares one layout:

     #/dashboard                 live overview
     #/register                  register a patient
     #/queue                     live queue
     #/patient/MF-1001           patient details
     #/triage                    triage worklist
     #/analytics                 analytics
     #/settings                  settings and demo data

   The sidebar links, the browser back button and direct links all work
   because routing is driven by window.location.hash only.
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.router = (function () {
  'use strict';

  var U = MediFlow.utils;
  var routes = {};
  var current = { name: 'dashboard', params: {} };
  var viewRoot = null;
  var mountedView = null;

  function define(views) {
    views.forEach(function (view) {
      if (view && view.meta && view.meta.name) routes[view.meta.name] = view;
    });
  }

  function parse(hash) {
    var raw = String(hash || '').replace(/^#\/?/, '');
    var parts = raw.split('/').filter(Boolean).map(function (part) {
      try { return decodeURIComponent(part); } catch (error) { return part; }
    });
    if (!parts.length) return { name: 'dashboard', params: {} };
    var name = parts[0];
    if (name === 'patient') return { name: 'patient', params: { id: parts[1] || '' } };
    if (routes[name]) return { name: name, params: {} };
    return { name: 'notfound', params: { requested: raw } };
  }

  /**
   * Render a page into a container and return the FRESH element that holds it.
   *
   * Why a fresh element: views attach delegated event listeners to the element
   * returned here. Re-using the same node would stack listeners on every
   * re-render (one click firing two dialogs). Replacing the node throws the old
   * listeners away with it, which keeps the behaviour predictable.
   */
  function renderInto(container, html) {
    var fresh = document.createElement('div');
    fresh.className = 'page';
    fresh.innerHTML = html;
    if (!container) return fresh;

    if (container.id === 'view') {
      /* The main region stays put so anchors to it keep working. */
      container.innerHTML = '';
      container.appendChild(fresh);
      return fresh;
    }
    if (container.parentNode) {
      container.parentNode.replaceChild(fresh, container);
      return fresh;
    }
    container.innerHTML = html;
    return container;
  }

  function notFound(route) {
    return {
      meta: { name: 'notfound', title: 'Page not found', subtitle: 'Unknown address' },
      render: function () {
        return MediFlow.views.shared.pageHead({
          icon: 'i-search',
          title: 'Page not found',
          subtitle: 'MediFlow could not match the address "' + U.esc(route.params.requested || '') + '".',
          tools: '<a class="btn" href="#/dashboard">' + U.icon('i-dashboard') + 'Go to the dashboard</a>'
        }) +
        '<div class="card"><div class="card-body">' +
        MediFlow.ui.empty('i-search', 'That page does not exist',
          'Use the sidebar to move between the dashboard, registration, the live queue, the triage worklist, analytics and settings.',
          '<a class="btn" href="#/dashboard">' + U.icon('i-dashboard') + 'Dashboard</a>' +
          '<a class="btn btn--secondary" href="#/queue">' + U.icon('i-queue') + 'Live queue</a>') +
        '</div></div>';
      },
      mount: function () {}
    };
  }

  function viewFor(name) {
    if (name === 'notfound') return null;
    return routes[name] || null;
  }

  function setActiveNav(name) {
    U.$$('.nav-item').forEach(function (item) {
      var route = item.getAttribute('data-route');
      var active = route === name || (name === 'patient' && route === 'queue');
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function render() {
    var search = window.location.hash || '#/dashboard';
    current = parse(search);
    var resolved = viewFor(current.name);
    var view = resolved || notFound(current);

    /* Charts are bound to canvases that are about to be removed. */
    MediFlow.charts.destroyAll();

    var titleEl = U.$('#page-title');
    var subtitleEl = U.$('#page-subtitle');
    if (titleEl) titleEl.textContent = view.meta.title || 'MediFlow';
    if (subtitleEl) subtitleEl.textContent = view.meta.subtitle || '';
    document.title = (view.meta.title ? view.meta.title + ' · ' : '') + MediFlow.config.APP.name;

    setActiveNav(current.name);

    viewRoot = U.$('#view');
    if (!viewRoot) return;

    var page = renderInto(viewRoot, view.render(current.params));
    mountedView = view;
    if (typeof view.mount === 'function') view.mount(page, current.params);

    if (MediFlow.app && MediFlow.app.refreshChrome) MediFlow.app.refreshChrome();

    if (U.$('#sidebar') && document.body.classList.contains('nav-open')) {
      document.body.classList.remove('nav-open');
      var scrim = U.$('#scrim');
      if (scrim) scrim.hidden = true;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /**
   * Re-render the current page after the data changed.
   * Views that hold user input implement update() themselves; this keeps
   * whatever the user typed from being wiped.
   */
  function refresh() {
    var view = viewFor(current.name);
    if (!view || !viewRoot) { render(); return; }
    var page = U.$('.page', viewRoot) || viewRoot;
    if (typeof view.update === 'function') {
      view.update(page, current.params);
    } else {
      var fresh = renderInto(page, view.render(current.params));
      if (typeof view.mount === 'function') view.mount(fresh, current.params);
    }
    if (MediFlow.app && MediFlow.app.refreshChrome) MediFlow.app.refreshChrome();
  }

  function navigate(path) {
    var target = path.charAt(0) === '#' ? path : '#/' + path.replace(/^\/+/, '');
    if (window.location.hash === target) render();
    else window.location.hash = target;
  }

  function currentName() { return current.name; }
  function currentParams() { return current.params; }
  function currentView() { return mountedView; }

  function start() {
    window.addEventListener('hashchange', render);
    if (!window.location.hash) window.location.hash = '#/dashboard';
    render();
  }

  return {
    define: define,
    start: start,
    render: render,
    refresh: refresh,
    navigate: navigate,
    renderInto: renderInto,
    currentName: currentName,
    currentParams: currentParams,
    currentView: currentView
  };
})();
