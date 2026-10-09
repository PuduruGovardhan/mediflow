/* ==========================================================================
   MediFlow | js/charts.js
   --------------------------------------------------------------------------
   Charts for the Dashboard and Analytics pages.

   The project brief allows Chart.js. MediFlow loads it from a CDN if the
   machine is online, but a hackathon demo must never break because the venue
   Wi-Fi is down – so if Chart.js is missing this module draws the same data
   as plain CSS bars. Same data, same colours, no dependency.

   Public API
     charts.available()                 -> bool (Chart.js loaded?)
     charts.register(canvasId, config)  -> keep a handle so charts can be rebuilt
     charts.rebuildAll()                -> called after each data change
     charts.destroyAll()
     charts.palette                     -> shared colours
     charts.renderBarList(id, rows)     -> always-CSS helper used by fallbacks
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.charts = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;

  var palette = {
    p1: '#b42318',
    p2: '#b45309',
    p3: '#a16207',
    p4: '#0d7a72',
    blue: '#0b6bcb',
    blueSoft: '#7fb4ea',
    teal: '#109c92',
    amber: '#dc6803',
    red: '#d92d20',
    green: '#079455',
    slate: '#94a3b8',
    grid: '#e2e8f0',
    ink: '#33445c'
  };

  var registry = [];   /* { id, build } */
  var instances = {};

  function available() { return typeof window.Chart === 'function'; }

  function levelColor(level) {
    return palette['p' + level] || palette.slate;
  }

  /* ---------------------------------------------------------------------
     Registration / lifecycle
     --------------------------------------------------------------------- */

  /** build() must return { type, data, options } or null to show an empty state. */
  function register(id, build) {
    registry = registry.filter(function (item) { return item.id !== id; });
    registry.push({ id: id, build: build });
  }

  function destroy(id) {
    if (instances[id]) {
      try { instances[id].destroy(); } catch (error) { /* ignore */ }
      delete instances[id];
    }
  }

  function destroyAll() {
    Object.keys(instances).forEach(destroy);
    registry = [];
  }

  function rebuildAll() {
    registry.slice().forEach(function (item) {
      var canvas = document.getElementById(item.id);
      if (!canvas) { destroy(item.id); return; }

      destroy(item.id);
      var spec = null;
      try {
        spec = item.build();
      } catch (error) {
        if (window.console && console.error) console.error('[MediFlow] chart build failed for ' + item.id, error);
      }

      var container = canvas.closest('.chart-box') || canvas.parentNode;
      var fallback = container ? container.querySelector('.chart-fallback') : null;

      if (!spec) {
        canvas.style.display = 'none';
        if (fallback) fallback.innerHTML = U.esc('No data to display yet.');
        return;
      }

      if (!available()) {
        canvas.style.display = 'none';
        if (fallback) fallback.innerHTML = spec.fallbackHtml || '<p class="muted small">Chart library unavailable.</p>';
        return;
      }

      canvas.style.display = '';
      if (fallback) fallback.innerHTML = '';
      try {
        instances[item.id] = new window.Chart(canvas.getContext('2d'), spec);
      } catch (error) {
        canvas.style.display = 'none';
        if (fallback) fallback.innerHTML = spec.fallbackHtml || '<p class="muted small">Chart could not be drawn.</p>';
      }
    });
  }

  /* ---------------------------------------------------------------------
     CSS fallback renderer
     --------------------------------------------------------------------- */

  /**
   * @param {Array} rows  [{ label, value, color, suffix }]
   * @param {Object} opts { max, emptyText }
   */
  function renderBarList(rows, opts) {
    var options = opts || {};
    if (!rows || !rows.length) {
      return '<p class="muted small center">' + U.esc(options.emptyText || 'No data to display yet.') + '</p>';
    }
    var max = options.max || rows.reduce(function (top, row) { return Math.max(top, row.value); }, 0) || 1;
    return '<div class="chart-fallback">' + rows.map(function (row) {
      var width = Math.max(2, Math.round((row.value / max) * 100));
      return '<div class="cf-row">' +
        '<span class="truncate" title="' + U.attr(row.label) + '">' + U.esc(row.label) + '</span>' +
        '<span class="cf-bar" style="width:' + width + '%;background:' + (row.color || palette.blue) + '"></span>' +
        '<span class="strong num">' + U.esc(String(row.value)) + (row.suffix ? U.esc(row.suffix) : '') + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }

  function fallbackFromLabels(labels, values, colors) {
    var rows = labels.map(function (label, index) {
      return { label: label, value: values[index], color: colors && colors[index] };
    });
    return renderBarList(rows);
  }

  /* ---------------------------------------------------------------------
     Shared Chart.js default options
     --------------------------------------------------------------------- */

  function baseOptions(extra) {
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      plugins: {
        legend: { labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, font: { size: 11 }, color: palette.ink } },
        tooltip: {
          backgroundColor: 'rgba(6,41,79,.94)',
          padding: 10,
          cornerRadius: 8,
          titleFont: { size: 12 },
          bodyFont: { size: 12 }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: palette.ink, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: palette.grid }, ticks: { color: palette.ink, font: { size: 11 }, precision: 0 } }
      }
    };
    return Object.assign(options, extra || {});
  }

  /* Chart.js is loaded asynchronously from a CDN. When it arrives, upgrade
     every chart that is currently showing the CSS fallback. If it never
     arrives, the fallback simply stays – nothing breaks. */
  window.__mediflowChartsReady = function () {
    if (!available()) return;
    rebuildAll();
  };

  return {
    palette: palette,
    available: available,
    levelColor: levelColor,
    register: register,
    destroy: destroy,
    destroyAll: destroyAll,
    rebuildAll: rebuildAll,
    renderBarList: renderBarList,
    fallbackFromLabels: fallbackFromLabels,
    baseOptions: baseOptions
  };
})();
