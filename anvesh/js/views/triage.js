/* ==========================================================================
   MediFlow | js/views/triage.js
   --------------------------------------------------------------------------
   The triage worklist.

   This page exists so a suggested priority can never be silently accepted or
   silently ignored. It has two halves:
     * Awaiting confirmation – the safety queue. Nothing here is in the
       ordered live queue until a member of staff decides.
     * Recently decided – an audit view showing the suggestion, the staff
       decision and the override reason side by side.
   ========================================================================== */

window.MediFlow = window.MediFlow || {};
MediFlow.views = MediFlow.views || {};

MediFlow.views.triage = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;
  var ui = MediFlow.ui;
  var shared = MediFlow.views.shared;

  var meta = {
    name: 'triage',
    title: 'Triage Assessment',
    subtitle: 'Rule-based suggestions with reasons, confirmed by staff'
  };

  function render() {
    var store = MediFlow.store;
    var pending = store.pendingTriage();
    var decided = store.all().filter(function (patient) {
      return U.num(patient.confirmedPriority, null) !== null && store.isActive(patient);
    }).sort(function (a, b) {
      return (U.toDate(b.confirmedAt) || 0) - (U.toDate(a.confirmedAt) || 0);
    }).slice(0, 12);

    var html = shared.pageHead({
      icon: 'i-triage',
      title: 'Triage assessment',
      subtitle: 'MediFlow applies transparent rules to what staff enter and shows exactly which rules fired. It never diagnoses and never decides — every priority is confirmed or overridden by an authorised person, and the override reason is stored separately.',
      tools: '<a class="btn btn--secondary" href="#/queue">' + U.icon('i-queue') + 'Live queue</a>' +
        '<a class="btn" href="#/register">' + U.icon('i-user-plus') + 'Register patient</a>'
    });

    html += '<div class="alert alert--info mb-2">' + U.icon('i-shield') +
      '<div><strong>How MediFlow decides — and what it will not do</strong>' +
      '<ul>' +
        '<li>Any critical warning sign (checked by staff or detected in the reported symptoms) produces <strong>Level 1</strong> and an emergency alert. Emergency care must never be delayed for registration.</li>' +
        '<li><strong>Age is never used on its own.</strong> It only adds a small caution when other signals are already present.</li>' +
        '<li><strong>A single soft symptom can never produce Level 2.</strong> Higher urgency needs a combination of signals.</li>' +
        '<li><strong>Missing or abnormal vital signs never produce a low priority.</strong> They raise the suggestion or ask for staff review instead.</li>' +
        '<li>Every suggestion lists its reasons, and staff can override it with a recorded reason.</li>' +
      '</ul></div></div>';

    html += '<div class="mb-2">' + ui.levelLegend() + '</div>';

    /* ------------------------ awaiting confirmation ------------------- */
    html += '<div class="section-title">' + U.icon('i-warning') + 'Awaiting staff confirmation' +
      '<span class="count-pill">' + pending.length + '</span></div>';

    if (!pending.length) {
      html += '<div class="card mb-2"><div class="card-body">' +
        ui.empty('i-check-circle', 'Nothing awaiting triage',
          'Every active patient has a staff-confirmed priority. New registrations that are saved without confirmation will appear here.',
          '<a class="btn" href="#/register">' + U.icon('i-user-plus') + 'Register a patient</a>') +
        '</div></div>';
    } else {
      html += '<div class="stack mb-2">' + pending.map(pendingCard).join('') + '</div>';
    }

    /* --------------------------- recently decided --------------------- */
    html += '<div class="section-title">' + U.icon('i-history') + 'Recently decided priorities' +
      '<span class="count-pill">' + decided.length + '</span></div>';

    html += '<div class="card"><div class="card-body card-body--tight">' +
      (decided.length
        ? '<div class="table-wrap"><table class="data">' +
          '<caption>Suggested priority, staff decision and override reason are stored as separate fields.</caption>' +
          '<thead><tr><th scope="col">Patient</th><th scope="col">Symptoms</th><th scope="col">Suggested</th>' +
          '<th scope="col">Confirmed</th><th scope="col">Override reason</th><th scope="col">Decided</th><th class="right" scope="col">Actions</th></tr></thead>' +
          '<tbody>' + decided.map(function (patient) {
            var suggested = U.num(patient.suggestedPriority, null);
            var confirmed = U.num(patient.confirmedPriority, null);
            var changed = suggested !== null && confirmed !== null && suggested !== confirmed;
            return '<tr class="row--p' + (confirmed || 4) + '">' +
              '<td><div class="cell-stack"><span class="flex" style="gap:6px"><span class="pid">' + U.esc(patient.id) + '</span>' + ui.demoBadge(patient.demo) + '</span>' +
                '<strong>' + U.esc(patient.name) + '</strong><span>' + U.esc(String(patient.age)) + ' yrs · ' + U.esc(patient.department) + '</span></div></td>' +
              '<td>' + shared.symptomsCell(patient, { max: 60 }) + '</td>' +
              '<td>' + (suggested ? ui.priorityBadge(suggested, { soft: true }) : '—') + '</td>' +
              '<td>' + (confirmed ? ui.priorityBadge(confirmed) : '—') + '</td>' +
              '<td>' + (changed
                ? '<span class="small">' + U.esc(U.clean(patient.overrideReason || 'Not stated', 90)) + '</span>' +
                  (confirmed < suggested ? ' <span class="badge badge--amber">Escalated</span>' : ' <span class="badge badge--slate">Reduced</span>')
                : '<span class="badge badge--green">' + U.icon('i-check') + 'Confirmed as suggested</span>') + '</td>' +
              '<td class="nowrap small muted">' + U.esc(U.relativeLabel(patient.confirmedAt)) + '<br />by ' + U.esc(patient.confirmedBy || '—') + '</td>' +
              '<td><div class="cell-actions">' +
                '<button class="btn btn--secondary btn--sm" data-action="open" data-id="' + U.attr(patient.id) + '">Open</button>' +
                '<button class="btn btn--secondary btn--sm" data-action="rereun" data-id="' + U.attr(patient.id) + '" title="Re-run the rule-based assessment with the current information">' + U.icon('i-refresh', 'ico--sm') + 'Re-run</button>' +
              '</div></td></tr>';
          }).join('') + '</tbody></table></div>'
        : ui.empty('i-history', 'No confirmed priorities yet', 'Once staff confirm a suggestion it will be listed here with the reason.')) +
      '</div></div>';

    return html;
  }

  function pendingCard(patient) {
    var level = U.num(patient.suggestedPriority, null);
    var info = cfg.PRIORITY_LEVELS[level] || cfg.PRIORITY_LEVELS[4];
    return '<div class="card"' + (patient.criticalAlert ? ' style="border:2px solid var(--red-600)"' : '') + '>' +
      '<div class="card-head">' +
        '<h3><span class="pid">' + U.esc(patient.id) + '</span> ' + U.esc(patient.name) + '</h3>' +
        '<div class="card-head-tools">' +
          (level ? ui.priorityBadge(level, { soft: true, long: true }) : '') +
          ui.sourceBadge(patient.source) + ui.demoBadge(patient.demo) +
          '<span class="badge badge--neutral">' + U.esc(String(patient.age)) + ' yrs · ' + U.esc(patient.department) + '</span>' +
          '<span class="badge badge--neutral">waiting ' + U.esc(U.durationLabel(patient.registeredAt)) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="card-body">' +
        (patient.criticalAlert
          ? '<div class="alert alert--danger mb-2">' + U.icon('i-alert') +
            '<div><strong>EMERGENCY: critical warning sign reported</strong><p>Seek immediate clinical assessment. Do not delay care while confirming the priority.</p></div></div>'
          : '') +
        '<div class="mb-2"><strong>Reported symptoms:</strong> ' + U.esc(patient.symptoms) +
          (patient.symptomDuration ? ' <span class="muted">(duration: ' + U.esc(patient.symptomDuration) + ')</span>' : '') + '</div>' +
        shared.assessmentPanel(patient, null) +
        '<div class="btn-row mt-2">' +
          '<button class="btn" data-action="priority" data-id="' + U.attr(patient.id) + '">' + U.icon('i-check') + 'Confirm or change priority</button>' +
          '<button class="btn btn--secondary" data-action="open" data-id="' + U.attr(patient.id) + '">' + U.icon('i-eye') + 'Open full record</button>' +
          '<button class="btn btn--secondary" data-action="add-vitals" data-id="' + U.attr(patient.id) + '">' + U.icon('i-thermometer') + 'Record vitals</button>' +
        '</div>' +
      '</div></div>';
  }

  function mount(root) {
    shared.bindPatientActions(root);

    /* One-click confirm of the suggested level for the common case. */
    U.on(root, 'click', '[data-action="rerun"]', function (event, button) {
      var patient = MediFlow.store.get(button.getAttribute('data-id'));
      if (!patient) return;
      var result = MediFlow.store.update(patient.id, { reassess: true }, { staff: shared.currentStaff() });
      if (!result.ok) {
        ui.toast.error('Could not re-run the assessment', Object.values(result.errors).join(' '));
        return;
      }
      var next = result.assessment.suggestedLevel;
      if (next === patient.suggestedPriority) {
        ui.toast.info('Assessment re-run', 'The rules still suggest L' + next + ' · ' + cfg.PRIORITY_LEVELS[next].name + ' for ' + patient.id + '.');
      } else {
        ui.toast.warn('Assessment changed', 'The rules now suggest L' + next + ' · ' + cfg.PRIORITY_LEVELS[next].name +
          ' instead of L' + (patient.suggestedPriority || '—') + '. Confirm or override it.');
      }
    });

    /* "Record vitals" jumps to the patient page edit dialog via the same
       editing flow, so there is one implementation of the form. */
    U.on(root, 'click', '[data-action="add-vitals"]', function (event, button) {
      window.location.hash = '#/patient/' + encodeURIComponent(button.getAttribute('data-id'));
    });

    U.on(root, 'click', '[data-action="load-demo"]', function () { MediFlow.actions.loadDemoData(); });
  }

  function update(root) {
    var view = MediFlow.router.renderInto(root, render());
    if (view) mount(view);
  }

  return { meta: meta, render: render, mount: mount, update: update };
})();
