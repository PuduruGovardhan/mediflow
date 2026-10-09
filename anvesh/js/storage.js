/* ==========================================================================
   MediFlow | js/storage.js
   --------------------------------------------------------------------------
   Persistence layer. The whole application state is one JSON document in
   localStorage. If localStorage is unavailable (private mode, file:// in some
   browsers) we transparently fall back to an in-memory store so the app still
   works for the demo session.

   Public API
     storage.status()      -> { persistent: bool, message: string }
     storage.load()        -> state object | null
     storage.save(state)   -> bool
     storage.clear()       -> void
     storage.backup()      -> JSON string
     storage.restore(json) -> { ok, state | error }
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.storage = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var memoryValue = null;
  var persistent = false;
  var reason = '';

  /* Feature-detect localStorage. Some browsers throw on access. */
  (function detect() {
    try {
      var probe = '__mediflow_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      persistent = true;
    } catch (error) {
      persistent = false;
      reason = 'Browser storage is unavailable in this window (private browsing or file:// restrictions), so MediFlow will keep data in memory for this session only.';
    }
  })();

  function status() {
    return {
      persistent: persistent,
      message: persistent
        ? 'Data is saved in this browser (localStorage) and survives a page reload.'
        : reason
    };
  }

  function load() {
    try {
      var raw = persistent ? window.localStorage.getItem(cfg.STORAGE.key) : memoryValue;
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (error) {
      /* Corrupt payload: keep a copy for debugging, then start clean. */
      try {
        if (persistent) window.localStorage.setItem(cfg.STORAGE.key + '.corrupt', String(memoryValue));
      } catch (ignored) { /* nothing else we can do */ }
      return null;
    }
  }

  function save(state) {
    var payload;
    try {
      payload = JSON.stringify(state);
    } catch (error) {
      return false;
    }
    memoryValue = payload;
    if (!persistent) return true;
    try {
      window.localStorage.setItem(cfg.STORAGE.key, payload);
      return true;
    } catch (error) {
      /* Quota exceeded or storage disabled at runtime. Degrade gracefully. */
      persistent = false;
      reason = 'Browser storage rejected the data (quota exceeded). MediFlow continues in memory for this session.';
      return false;
    }
  }

  function clear() {
    memoryValue = null;
    if (!persistent) return;
    try { window.localStorage.removeItem(cfg.STORAGE.key); } catch (error) { /* ignore */ }
  }

  function backup() {
    var raw = persistent ? window.localStorage.getItem(cfg.STORAGE.key) : memoryValue;
    return raw || '{}';
  }

  function restore(json) {
    var parsed;
    try {
      parsed = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (error) {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.patients)) {
      return { ok: false, error: 'That file does not look like a MediFlow backup (no patients list found).' };
    }
    return { ok: true, state: parsed };
  }

  /** Rough size of the stored payload, for the Settings page. */
  function sizeBytes() {
    var raw = persistent ? window.localStorage.getItem(cfg.STORAGE.key) : memoryValue;
    return raw ? raw.length : 0;
  }

  return {
    status: status,
    load: load,
    save: save,
    clear: clear,
    backup: backup,
    restore: restore,
    sizeBytes: sizeBytes
  };
})();
