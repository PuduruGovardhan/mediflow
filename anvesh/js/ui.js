/* ==========================================================================
   MediFlow | js/ui.js
   --------------------------------------------------------------------------
   Reusable interface pieces. Keeping these here means every page looks and
   behaves the same way, and there is exactly one implementation of a
   confirmation dialog.

   Contents
   1. Small HTML fragments (badges, chips, level cards, empty states)
   2. Toasts
   3. Dialogs (confirmations, reason prompts, forms) – promise based
   4. Keyboard & focus handling
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.ui = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;

  /* ---------------------------------------------------------------------
     1. HTML fragments
     --------------------------------------------------------------------- */

  /** Solid pill showing a priority level: "L1 Critical". */
  function priorityBadge(level, options) {
    var opts = options || {};
    var info = cfg.PRIORITY_LEVELS[level];
    if (!info) {
      return '<span class="badge badge--neutral" title="Priority not yet confirmed by staff">' +
        U.icon('i-info') + 'Not confirmed</span>';
    }
    var cls = opts.soft ? 'badge--p' + level + '-soft' : 'badge--p' + level;
    var text = opts.long ? info.label + ' – ' + info.name : 'L' + info.level + ' ' + info.short;
    return '<span class="badge ' + cls + '" title="' + U.attr(info.description) + '">' + U.esc(text) + '</span>';
  }

  function statusBadge(status) {
    var info = cfg.STATUSES[status] || { label: status, tone: 'slate', icon: 'i-info' };
    return '<span class="badge badge--' + info.tone + '">' + U.icon(info.icon) + U.esc(info.label) + '</span>';
  }

  function sourceBadge(source) {
    var info = cfg.SOURCES[source] || cfg.SOURCES.outpatient;
    return '<span class="badge badge--' + (source === 'emergency' ? 'red' : 'blue') + '">' +
      U.icon(info.icon) + U.esc(info.short) + '</span>';
  }

  function demoBadge(isDemo) {
    return isDemo ? '<span class="badge badge--demo" title="Fictional demonstration record">' + U.icon('i-info') + 'DEMO</span>' : '';
  }

  function reviewBadge(patient) {
    if (!patient || !patient.requiresStaffReview) return '';
    return '<span class="badge badge--amber" title="MediFlow is asking a member of staff to review this record">' +
      U.icon('i-warning') + 'Review</span>';
  }

  function chip(icon, text, tone) {
    return '<span class="chip' + (tone ? ' chip--' + tone : '') + '">' + U.icon(icon) + U.esc(text) + '</span>';
  }

  function levelLegend(activeLevel) {
    return '<div class="level-legend">' + [1, 2, 3, 4].map(function (level) {
      var info = cfg.PRIORITY_LEVELS[level];
      return '<div class="level-card level-card--p' + level + '">' +
        '<strong>' + U.esc(info.label + ' – ' + info.name) + '</strong>' +
        '<p>' + U.esc(info.description) + '</p>' +
        '</div>';
    }).join('') + '</div>';
  }

  function empty(icon, title, message, actionsHtml) {
    return '<div class="empty">' +
      '<div class="icon-wrap">' + U.icon(icon, 'ico--xl') + '</div>' +
      '<h3>' + U.esc(title) + '</h3>' +
      '<p>' + (message || '') + '</p>' +
      (actionsHtml ? '<div class="btn-row">' + actionsHtml + '</div>' : '') +
      '</div>';
  }

  function disclaimerBox(kind) {
    var text = cfg.DISCLAIMERS[kind] || '';
    return '<div class="alert alert--info">' + U.icon('i-shield') +
      '<div><strong>How to read this</strong><p>' + U.esc(text) + '</p></div></div>';
  }

  function alertBox(tone, icon, title, bodyHtml) {
    return '<div class="alert alert--' + tone + '">' + U.icon(icon) +
      '<div><strong>' + U.esc(title) + '</strong>' + (bodyHtml ? bodyHtml : '') + '</div></div>';
  }

  /* ---------------------------------------------------------------------
     2. Toasts
     --------------------------------------------------------------------- */

  var TOAST_ICONS = { success: 'i-check-circle', error: 'i-alert', warn: 'i-warning', info: 'i-info' };

  function toast(options) {
    var opts = typeof options === 'string' ? { message: options } : (options || {});
    var type = ['success', 'error', 'warn', 'info'].indexOf(opts.type) === -1 ? 'info' : opts.type;
    var host = U.$('#toast-host');
    if (!host) return function () {};

    var node = document.createElement('div');
    node.className = 'toast toast--' + type;
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');
    node.innerHTML =
      '<span class="toast-ico">' + U.icon(TOAST_ICONS[type], 'ico--lg') + '</span>' +
      '<div class="toast-body">' +
        (opts.title ? '<strong>' + U.esc(opts.title) + '</strong>' : '') +
        (opts.message ? '<p>' + U.esc(opts.message) + '</p>' : '') +
      '</div>' +
      '<button class="toast-close" type="button" aria-label="Dismiss message">' + U.icon('i-close', 'ico--sm') + '</button>';

    var timer = null;
    function close() {
      if (timer) clearTimeout(timer);
      node.classList.add('is-leaving');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }
    U.$('.toast-close', node).addEventListener('click', close);
    host.appendChild(node);

    var timeout = opts.timeout === undefined ? (type === 'error' ? 8000 : 4600) : opts.timeout;
    if (timeout > 0) timer = setTimeout(close, timeout);
    return close;
  }

  toast.success = function (title, message) { return toast({ type: 'success', title: title, message: message }); };
  toast.error = function (title, message) { return toast({ type: 'error', title: title, message: message }); };
  toast.warn = function (title, message) { return toast({ type: 'warn', title: title, message: message }); };
  toast.info = function (title, message) { return toast({ type: 'info', title: title, message: message }); };

  /* ---------------------------------------------------------------------
     3. Dialogs
     --------------------------------------------------------------------- */

  var openDialogs = [];

  /**
   * Open a dialog. Returns a Promise that resolves with the collected values
   * object, or null when the user cancels.
   *
   * options
   *   title, subtitle, icon, iconTone
   *   size            'sm' | 'md' | 'lg'
   *   message         HTML string placed above the fields
   *   fields          [{ name, label, type, required, help, placeholder, value,
   *                      minLength, options:[{value,label}], rows }]
   *                   type: text | textarea | number | select | priority | check
   *   confirmLabel, cancelLabel, tone ('primary' | 'danger' | 'warn' | 'teal')
   *   validate(values) -> { field: message } | null
   *   dismissible     default true (backdrop click and Escape close)
   *   onMount(root, api)
   */
  function dialog(options) {
    var opts = options || {};
    var host = U.$('#modal-host');
    if (!host) return Promise.resolve(null);

    return new Promise(function (resolve) {
      var fields = opts.fields || [];
      var fieldNodes = {};

      /* --- build fields --- */
      var fieldsHtml = fields.map(function (field) {
        var name = field.name;
        var value = field.value === undefined || field.value === null ? '' : String(field.value);
        var required = field.required ? ' <span class="req">*</span>' : '';
        var hint = field.hint ? ' <span class="hint-tag">' + U.esc(field.hint) + '</span>' : '';
        var help = field.help ? '<span class="help">' + U.esc(field.help) + '</span>' : '';
        var input;

        if (field.type === 'textarea') {
          input = '<textarea id="f-' + name + '" name="' + name + '" rows="' + (field.rows || 3) + '" placeholder="' + U.attr(field.placeholder || '') + '">' + U.esc(value) + '</textarea>';
        } else if (field.type === 'select') {
          input = '<select id="f-' + name + '" name="' + name + '">' +
            (field.options || []).map(function (opt) {
              return '<option value="' + U.attr(opt.value) + '"' + (String(opt.value) === value ? ' selected' : '') + '>' + U.esc(opt.label) + '</option>';
            }).join('') + '</select>';
        } else if (field.type === 'priority') {
          input = '<div class="radio-cards">' + [1, 2, 3, 4].map(function (level) {
            var info = cfg.PRIORITY_LEVELS[level];
            var checked = String(level) === value || (value === '' && field.defaultValue === level);
            return '<label class="radio-card">' +
              '<input type="radio" name="' + name + '" value="' + level + '"' + (checked ? ' checked' : '') + ' />' +
              '<span><strong>L' + level + ' · ' + U.esc(info.name) + '</strong>' +
              '<span>' + U.esc(info.description) + '</span></span>' +
              '</label>';
          }).join('') + '</div>';
        } else if (field.type === 'check') {
          input = '<label class="checkline"><input type="checkbox" name="' + name + '"' + (value === 'true' || value === true ? ' checked' : '') + ' /> <span>' + (field.checkLabel || '') + '</span></label>';
        } else {
          input = '<input id="f-' + name + '" type="' + (field.type || 'text') + '" name="' + name + '" value="' + U.attr(value) + '" placeholder="' + U.attr(field.placeholder || '') + '"' +
            (field.min !== undefined ? ' min="' + field.min + '"' : '') +
            (field.max !== undefined ? ' max="' + field.max + '"' : '') +
            (field.step !== undefined ? ' step="' + field.step + '"' : '') + ' />';
        }

        var wide = field.full || field.type === 'priority' || (field.type === 'textarea' && field.rows >= 3);
        return '<div class="field' + (wide ? ' field--full' : '') + '" data-field="' + name + '">' +
          '<label for="f-' + name + '">' + U.esc(field.label) + required + hint + '</label>' +
          input + help +
          '<span class="field-error" data-error="' + name + '"></span>' +
          '</div>';
      }).join('');

      var tone = opts.tone || 'primary';
      var confirmClass = tone === 'primary' ? 'btn' : 'btn btn--' + tone;

      var wrapper = document.createElement('div');
      wrapper.className = 'modal modal--' + (opts.size || 'md');
      wrapper.setAttribute('role', 'dialog');
      wrapper.setAttribute('aria-modal', 'true');
      wrapper.setAttribute('aria-labelledby', 'dlg-title');
      wrapper.innerHTML =
        '<div class="modal-content">' +
          '<div class="modal-head">' +
            (opts.icon ? '<span class="modal-icon' + (opts.iconTone ? ' modal-icon--' + opts.iconTone : '') + '">' + U.icon(opts.icon, 'ico--lg') + '</span>' : '') +
            '<div class="flex-1">' +
              '<h2 id="dlg-title">' + U.esc(opts.title || 'Please confirm') + '</h2>' +
              (opts.subtitle ? '<p>' + U.esc(opts.subtitle) + '</p>' : '') +
            '</div>' +
            '<button class="icon-btn" type="button" data-close aria-label="Close dialog">' + U.icon('i-close') + '</button>' +
          '</div>' +
          '<div class="modal-body">' +
            (opts.message ? '<div class="mb-2">' + opts.message + '</div>' : '') +
            (fieldsHtml ? '<div class="form-grid">' + fieldsHtml + '</div>' : '') +
            '<div class="mt-2" data-extra></div>' +
          '</div>' +
          '<div class="modal-foot">' +
            '<button class="btn btn--secondary" type="button" data-cancel>' + U.esc(opts.cancelLabel || 'Cancel') + '</button>' +
            '<button class="' + confirmClass + '" type="button" data-confirm>' + U.esc(opts.confirmLabel || 'Confirm') + '</button>' +
          '</div>' +
        '</div>';

      host.hidden = false;
      host.appendChild(wrapper);

      var confirmBtn = U.$('[data-confirm]', wrapper);
      var cancelBtn = U.$('[data-cancel]', wrapper);
      var closeBtn = U.$('[data-close]', wrapper);

      fields.forEach(function (field) {
        fieldNodes[field.name] = U.$('[data-field="' + field.name + '"]', wrapper);
      });

      var previouslyFocused = document.activeElement;
      var entry = { close: finish, dismissible: opts.dismissible !== false };

      /* --- collect values --- */
      function collect() {
        var values = {};
        fields.forEach(function (field) {
          var container = fieldNodes[field.name];
          var value;
          if (field.type === 'priority') {
            var checked = U.$('input[name="' + field.name + '"]:checked', container);
            value = checked ? Number(checked.value) : '';
          } else if (field.type === 'check') {
            value = U.$('input[name="' + field.name + '"]', container).checked;
          } else {
            var input = U.$('[name="' + field.name + '"]', container);
            value = input ? input.value : '';
            if (field.type === 'number' && value !== '') value = Number(value);
          }
          values[field.name] = value;
        });
        return values;
      }

      function clearErrors() {
        U.$$('.field-error', wrapper).forEach(function (node) { node.textContent = ''; });
        U.$$('.field', wrapper).forEach(function (node) { node.classList.remove('has-error'); });
      }

      function showErrors(errors) {
        Object.keys(errors || {}).forEach(function (name) {
          var container = U.$('[data-field="' + name + '"]', wrapper);
          var message = U.$('[data-error="' + name + '"]', wrapper);
          if (container) container.classList.add('has-error');
          if (message) message.textContent = errors[name];
        });
        var firstBad = U.$('.field.has-error input, .field.has-error textarea, .field.has-error select', wrapper);
        if (firstBad) firstBad.focus();
      }

      /** Built-in validation: required, minLength, numeric. */
      function builtinValidate(values) {
        var errors = {};
        fields.forEach(function (field) {
          var value = values[field.name];
          var empty = value === '' || value === null || value === undefined || value === false;
          var label = field.label || field.name;
          if (field.required && empty) {
            errors[field.name] = field.type === 'priority' ? 'Choose one of the four levels.' : 'Please complete "' + label + '".';
            return;
          }
          if (!empty && typeof value === 'string' && field.minLength && value.trim().length < field.minLength) {
            errors[field.name] = '"' + label + '" needs at least ' + field.minLength + ' characters.';
          }
          if (!empty && field.type === 'number') {
            if (isNaN(value)) errors[field.name] = '"' + label + '" must be a number.';
            else if (field.min !== undefined && value < field.min) errors[field.name] = '"' + label + '" must be at least ' + field.min + '.';
            else if (field.max !== undefined && value > field.max) errors[field.name] = '"' + label + '" must be at most ' + field.max + '.';
          }
        });
        return errors;
      }

      function finish(result) {
        if (entry.closed) return;
        entry.closed = true;
        document.removeEventListener('keydown', onKeydown, true);
        openDialogs = openDialogs.filter(function (item) { return item !== entry; });
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        if (!U.$$('.modal', host).length) host.hidden = true;
        if (previouslyFocused && previouslyFocused.focus) {
          try { previouslyFocused.focus(); } catch (error) { /* ignore */ }
        }
        resolve(result);
      }

      function submit() {
        var values = collect();
        clearErrors();
        var errors = builtinValidate(values);
        if (!Object.keys(errors).length && typeof opts.validate === 'function') {
          errors = opts.validate(values) || {};
        }
        if (Object.keys(errors).length) {
          showErrors(errors);
          return;
        }
        finish(values);
      }

      function onKeydown(event) {
        if (event.key === 'Escape' && opts.dismissible !== false) {
          event.stopPropagation();
          finish(null);
        } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          submit();
        }
      }

      confirmBtn.addEventListener('click', submit);
      cancelBtn.addEventListener('click', function () { finish(null); });
      closeBtn.addEventListener('click', function () { finish(null); });
      /* The backdrop listener is attached once for the whole dialog host. */
      if (!host.dataset.backdropBound) {
        host.dataset.backdropBound = '1';
        host.addEventListener('mousedown', function (event) {
          if (event.target !== host) return;
          var top = openDialogs[openDialogs.length - 1];
          if (top && top.close && top.dismissible) top.close(null);
        });
      }
      document.addEventListener('keydown', onKeydown, true);

      openDialogs.push(entry);
      if (typeof opts.onMount === 'function') opts.onMount(wrapper, { collect: collect, close: finish, submit: submit });

      var focusTarget = U.$('textarea, input, select', wrapper) || confirmBtn;
      setTimeout(function () { if (focusTarget && focusTarget.focus) focusTarget.focus(); }, 40);
    });
  }

  /** Yes/no confirmation. Resolves true or false. */
  function confirm(options) {
    var opts = options || {};
    return dialog({
      title: opts.title || 'Are you sure?',
      subtitle: opts.subtitle,
      icon: opts.icon || 'i-warning',
      iconTone: opts.iconTone || 'amber',
      size: opts.size || 'sm',
      message: opts.message,
      fields: opts.fields,
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
      tone: opts.tone || 'primary',
      validate: opts.validate
    }).then(function (values) { return values || false; });
  }

  /* ---------------------------------------------------------------------
     4. Misc helpers
     --------------------------------------------------------------------- */

  /** Live clock in the top bar. Returns a stop function. */
  function startClock() {
    var node = U.$('#clock');
    if (!node) return function () {};
    function tick() {
      var date = new Date();
      node.textContent = U.pad(date.getHours()) + ':' + U.pad(date.getMinutes());
      node.title = U.dateTimeLabel(date);
    }
    tick();
    var timer = setInterval(tick, 15000);
    return function () { clearInterval(timer); };
  }

  /** Move focus to the main view region (used by the router for a11y). */
  function focusView() {
    var view = U.$('#view');
    if (view) {
      try { view.focus({ preventScroll: true }); } catch (error) { view.focus(); }
    }
  }

  function closeAllDialogs() {
    openDialogs.slice().forEach(function (entry) { entry.close(null); });
  }

  return {
    priorityBadge: priorityBadge,
    statusBadge: statusBadge,
    sourceBadge: sourceBadge,
    demoBadge: demoBadge,
    reviewBadge: reviewBadge,
    chip: chip,
    levelLegend: levelLegend,
    empty: empty,
    disclaimerBox: disclaimerBox,
    alertBox: alertBox,
    toast: toast,
    dialog: dialog,
    confirm: confirm,
    startClock: startClock,
    focusView: focusView,
    closeAllDialogs: closeAllDialogs
  };
})();
