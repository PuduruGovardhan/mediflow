/* ==========================================================================
   MediFlow | js/utils.js
   --------------------------------------------------------------------------
   Small, dependency-free helper functions used everywhere else.
   Nothing here knows about patients or triage – it is pure plumbing.

   Groups
   1. DOM helpers
   2. Escaping & text safety
   3. Identity (IDs, keys)
   4. Dates, times & durations
   5. Numbers & formatting
   6. Validation primitives
   7. Objects, arrays & misc
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.utils = (function () {
  'use strict';

  /* ------------------------------ 1. DOM --------------------------------- */

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  /** Create an element. attrs may include `class`, `text`, `html`, `dataset`. */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'dataset') Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
        else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, value);
      });
    }
    if (children !== undefined && children !== null) {
      (Array.isArray(children) ? children : [children]).forEach(function (child) {
        if (child === null || child === undefined || child === false) return;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
    }
    return node;
  }

  /** Icon helper: returns an <svg> that references the inline sprite. */
  function icon(name, extraClass) {
    return '<svg class="ico ' + (extraClass || '') + '" aria-hidden="true"><use href="#' + name + '"></use></svg>';
  }

  /** Delegated event listener: on(container, 'click', '.btn', handler). */
  function on(root, type, selector, handler) {
    root.addEventListener(type, function (event) {
      var target = event.target.closest(selector);
      if (target && root.contains(target)) handler(event, target);
    });
  }

  /* ------------------------ 2. ESCAPING & SAFETY ------------------------- */

  /** Escape text before putting it inside an HTML template string. */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Escape a value for use inside a quoted HTML attribute. */
  function attr(value) { return esc(value); }

  function stripTags(value) { return String(value || '').replace(/<[^>]*>/g, ''); }

  /** Trim + collapse whitespace, then cap the length. */
  function clean(value, maxLength) {
    var text = stripTags(String(value === null || value === undefined ? '' : value)).replace(/\s+/g, ' ').trim();
    if (maxLength && text.length > maxLength) text = text.slice(0, maxLength);
    return text;
  }

  /* --------------------------- 3. IDENTITY ------------------------------- */

  function randomToken(length) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < (length || 6); i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  /** Unique-enough internal key for DOM ids and event wiring. */
  function uid(prefix) { return (prefix || 'id') + '-' + randomToken(7).toLowerCase(); }

  /* -------------------- 4. DATES, TIMES & DURATIONS ---------------------- */

  function nowIso() { return new Date().toISOString(); }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    var parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function timeLabel(value) {
    var date = toDate(value);
    if (!date) return '—';
    return pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function dateTimeLabel(value) {
    var date = toDate(value);
    if (!date) return '—';
    return dateLabel(date) + ', ' + timeLabel(date);
  }

  function dateLabel(value) {
    var date = toDate(value);
    if (!date) return '—';
    return pad(date.getDate()) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()] + ' ' + date.getFullYear();
  }

  /** "just now", "12 min ago", "3 h ago", "2 d ago" */
  function relativeLabel(value) {
    var date = toDate(value);
    if (!date) return '—';
    var seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 0) seconds = 0;
    if (seconds < 45) return 'just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + ' min ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' h ago';
    var days = Math.floor(hours / 24);
    return days + ' d ago';
  }

  /** Duration between two timestamps as "1 h 24 min" / "18 min" / "45 s". */
  function durationLabel(fromValue, toValue) {
    var from = toDate(fromValue);
    var to = toValue ? toDate(toValue) : new Date();
    if (!from || !to) return '—';
    var ms = Math.max(0, to.getTime() - from.getTime());
    var totalMinutes = Math.floor(ms / 60000);
    if (totalMinutes < 1) return Math.max(1, Math.round(ms / 1000)) + ' s';
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    if (hours < 1) return minutes + ' min';
    if (hours < 24) return hours + ' h' + (minutes ? ' ' + minutes + ' min' : '');
    var days = Math.floor(hours / 24);
    return days + ' d ' + (hours % 24) + ' h';
  }

  /** Minutes between two timestamps (number, may be fractional). */
  function minutesBetween(fromValue, toValue) {
    var from = toDate(fromValue);
    var to = toValue ? toDate(toValue) : new Date();
    if (!from || !to) return 0;
    return Math.max(0, (to.getTime() - from.getTime()) / 60000);
  }

  function startOfDay(value) {
    var date = toDate(value) || new Date();
    var copy = new Date(date.getTime());
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function isSameDay(a, b) {
    var dateA = toDate(a);
    var dateB = toDate(b) || new Date();
    if (!dateA) return false;
    return dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() === dateB.getMonth() && dateA.getDate() === dateB.getDate();
  }

  /** ISO string for an <input type="datetime-local"> value. */
  function toLocalInputValue(value) {
    var date = toDate(value) || new Date();
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  /* ----------------------- 5. NUMBERS & FORMATTING ----------------------- */

  function num(value, fallback) {
    if (value === '' || value === null || value === undefined) return fallback === undefined ? null : fallback;
    var parsed = Number(value);
    return isNaN(parsed) ? (fallback === undefined ? null : fallback) : parsed;
  }

  function round(value, decimals) {
    var factor = Math.pow(10, decimals || 0);
    return Math.round(value * factor) / factor;
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function percent(part, whole) {
    if (!whole) return 0;
    return round((part / whole) * 100, 0);
  }

  function plural(count, singular, pluralWord) {
    return count === 1 ? singular : (pluralWord || singular + 's');
  }

  function initials(name) {
    var parts = clean(name).split(' ').filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Human-friendly age band used in a few places (never used alone to triage). */
  function ageBand(age) {
    var years = num(age, null);
    if (years === null) return 'Unknown';
    if (years < 1) return 'Infant';
    if (years < 5) return 'Young child';
    if (years < 13) return 'Child';
    if (years < 18) return 'Adolescent';
    if (years < 65) return 'Adult';
    return 'Older adult';
  }

  /* --------------------------- 6. VALIDATION ----------------------------- */

  function isBlank(value) { return value === null || value === undefined || String(value).trim() === ''; }

  function isPhoneLike(value) {
    if (isBlank(value)) return true; /* optional field */
    return /^[+()\-.\s\d]{6,20}$/.test(String(value).trim());
  }

  /** Duplicate / low-quality symptom text detection. */
  function hasMeaningfulText(value, minWords) {
    var words = clean(value).split(' ').filter(Boolean);
    return words.length >= (minWords || 2) && clean(value).length >= 6;
  }

  function asArray(value) { return Array.isArray(value) ? value : []; }

  function firstDefined() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
    }
    return null;
  }

  /* ---------------------------- 7. OBJECTS ------------------------------- */

  function clone(value) { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }

  function merge(base, patch) {
    var out = clone(base) || {};
    Object.keys(patch || {}).forEach(function (key) { out[key] = patch[key]; });
    return out;
  }

  function deepMerge(base, patch) {
    var out = clone(base) || {};
    Object.keys(patch || {}).forEach(function (key) {
      var value = patch[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) {
        out[key] = deepMerge(base[key], value);
      } else {
        out[key] = clone(value);
      }
    });
    return out;
  }

  function sortBy(list, accessor, direction) {
    var dir = direction === 'desc' ? -1 : 1;
    return list.slice().sort(function (a, b) {
      var va = accessor(a);
      var vb = accessor(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return va < vb ? -dir : dir;
    });
  }

  function groupCount(list, accessor) {
    var out = {};
    list.forEach(function (item) {
      var key = accessor(item);
      if (key === null || key === undefined || key === '') key = 'Unspecified';
      out[key] = (out[key] || 0) + 1;
    });
    return out;
  }

  function sum(list, accessor) {
    return list.reduce(function (total, item) { return total + (num(accessor(item), 0) || 0); }, 0);
  }

  function average(list, accessor) {
    if (!list.length) return 0;
    return sum(list, accessor) / list.length;
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var context = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, wait || 200);
    };
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  return {
    $: $, $$: $$, el: el, icon: icon, on: on,
    esc: esc, attr: attr, clean: clean, stripTags: stripTags,
    uid: uid, randomToken: randomToken,
    nowIso: nowIso, toDate: toDate, timeLabel: timeLabel, dateLabel: dateLabel,
    dateTimeLabel: dateTimeLabel, relativeLabel: relativeLabel, durationLabel: durationLabel,
    minutesBetween: minutesBetween, startOfDay: startOfDay, isSameDay: isSameDay,
    toLocalInputValue: toLocalInputValue, pad: pad,
    num: num, round: round, clamp: clamp, percent: percent, plural: plural,
    initials: initials, ageBand: ageBand,
    isBlank: isBlank, isPhoneLike: isPhoneLike, hasMeaningfulText: hasMeaningfulText,
    asArray: asArray, firstDefined: firstDefined,
    clone: clone, merge: merge, deepMerge: deepMerge, sortBy: sortBy,
    groupCount: groupCount, sum: sum, average: average,
    debounce: debounce, download: download
  };
})();
