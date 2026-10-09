/* ==========================================================================
   MediFlow | tests/browser-check.js
   --------------------------------------------------------------------------
   End-to-end check that drives the REAL user interface in headless Chrome
   through the hackathon demonstration workflow, clicking the actual buttons
   and confirming the actual dialogs.

   It uses only Node built-ins (child_process + the built-in WebSocket) and the
   Chrome DevTools Protocol, so there is nothing to install.

   Usage:
     node server.js 4173 &          (or: npm start)
     node tests/browser-check.js

   Environment:
     MEDIFLOW_URL   default http://127.0.0.1:4173/
     CHROME_PATH    override the auto-detected Chrome/Edge executable
   ========================================================================== */

'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const URL_BASE = process.env.MEDIFLOW_URL || 'http://127.0.0.1:4173/';
const DEBUG_PORT = Number(process.env.CDP_PORT || 9333);

/* --------------------------- locate a browser --------------------------- */

function findBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const candidate of candidates) {
    try { if (candidate && fs.existsSync(candidate)) return candidate; } catch (error) { /* keep looking */ }
  }
  return null;
}

/* ------------------------------ CDP client ------------------------------ */

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.handlers = [];
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (error) { return; }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
        this.handlers.forEach((handler) => handler(message));
      }
    });
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, 30000);
    });
  }

  on(handler) { this.handlers.push(handler); }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until a URL answers with a success status. */
async function waitForOk(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Timed out waiting for ' + url);
}

/** Poll until a URL answers with parseable JSON (the CDP endpoints). */
async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        try { return JSON.parse(text); } catch (error) { /* still starting up */ }
      }
    } catch (error) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Timed out waiting for ' + url);
}

/* ----------------------- the in-page test workflow ---------------------- */

/* Written as a string because it runs inside the browser. It returns an
   array of step results, or throws with the first failure. */
const WORKFLOW = `(async function () {
  var steps = [];
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function ok(message) { steps.push('PASS ' + message); }
  function assert(condition, message) { if (!condition) throw new Error(message); steps.push('PASS ' + message); }
  function q(selector, where) { return (where || document).querySelector(selector); }
  function qa(selector, where) { return Array.prototype.slice.call((where || document).querySelectorAll(selector)); }
  async function click(selector, where) {
    var node = (where || document).querySelector(selector);
    if (!node) throw new Error('No element matches ' + selector);
    node.click();
    await sleep(120);
    return node;
  }
  async function clickNode(node) {
    if (!node) throw new Error('Expected an element to click');
    node.click();
    await sleep(140);
    return node;
  }
  async function confirmDialog(expectedCount) {
    var host = q('#modal-host');
    if (!host || host.hidden || !q('#modal-host [data-confirm]')) throw new Error('Expected a dialog to be open');
    var dialogs = qa('#modal-host .modal');
    assert(dialogs.length === (expectedCount || 1), 'exactly one dialog is open (found ' + dialogs.length + ')');
    await click('#modal-host [data-confirm]');
    await sleep(220);
    assert(!q('#modal-host [data-confirm]'), 'the dialog closed after confirming');
  }
  async function go(hash) {
    window.location.hash = hash;
    await sleep(340);
  }

  /* ---------------------------------------------------------------- 1 */
  assert(window.MediFlow, 'the MediFlow namespace loaded');
  assert(q('#view .page'), 'a page was rendered into the main region');
  assert(qa('.nav-item').length === 6, 'six navigation entries exist');
  assert(MediFlow.router.currentName() === 'dashboard', 'the app opened on the dashboard');

  /* Empty state first */
  MediFlow.store.clearAll();
  await sleep(260);
  assert(q('[data-action="load-demo"]'), 'the empty dashboard offers a demo-data button');
  assert(q('#view').textContent.indexOf('No patient records yet') !== -1, 'the empty state is explained to the user');

  /* ---------------------------------------------------------------- 2 */
  await click('[data-action="load-demo"]');
  await confirmDialog();
  var loaded = MediFlow.store.all().length;
  assert(loaded >= 10, 'demo patients were loaded through the real button (count ' + loaded + ')');
  assert(MediFlow.store.all().every(function (p) { return p.demo; }), 'every loaded record is flagged as demo data');
  assert(q('#demo-host .demo-banner'), 'the demo banner is displayed');
  assert(q('.stat-value'), 'dashboard statistics rendered');
  assert(q('#alert-host .emergency-alert'), 'the emergency alert banner is visible for the Level 1 patient');
  assert(q('#alert-host').textContent.indexOf('immediate clinical assessment') !== -1, 'the alert tells staff to act immediately');

  /* ---------------------------------------------------------------- 3 */
  var dashText = q('#view').textContent;
  assert(dashText.indexOf('Total registered') !== -1, 'the dashboard shows total registered patients');
  assert(dashText.indexOf('Waiting') !== -1, 'the dashboard shows waiting patients');
  assert(dashText.indexOf('Urgent (Level 1') !== -1, 'the dashboard shows urgent patients');
  assert(dashText.indexOf('In consultation') !== -1, 'the dashboard shows patients in consultation');
  assert(dashText.indexOf('Completed') !== -1, 'the dashboard shows completed consultations');
  assert(dashText.indexOf('Illustrative waiting estimate') !== -1, 'the waiting figure is labelled as an estimate');
  assert(q('#chart-distribution'), 'the distribution chart container exists');

  /* Charts must render even with no network: either Chart.js canvases or the
     built-in CSS fallback. */
  var chartBoxes = qa('.chart-box');
  assert(chartBoxes.length > 0, 'chart boxes are present');
  assert(chartBoxes.filter(isDrawn).length === chartBoxes.length,
    'every chart on the dashboard is drawn (Chart.js or the CSS fallback)');

  /* ---------------------------------------------------------------- 4 */
  await go('#/queue');
  assert(MediFlow.router.currentName() === 'queue', 'navigation to the live queue works');
  assert(q('#q-search'), 'the queue has a search box');
  assert(q('.queue-position'), 'the queue shows positions');
  var queue = MediFlow.store.activeQueue();
  assert(queue[0].confirmedPriority === 1, 'the first patient in the live queue is Level 1');
  for (var i = 1; i < queue.length; i++) {
    assert(queue[i - 1].confirmedPriority <= queue[i].confirmedPriority, 'the queue is ordered by urgency');
  }
  assert(q('#view').textContent.indexOf('Awaiting triage confirmation') !== -1, 'unconfirmed patients are shown in a prominent strip');

  /* Every queue row EXCEPT the ones in the always-visible "awaiting triage
     confirmation" strips, which are deliberately not affected by filters. */
  function queueRows() {
    var rows = [];
    qa('#view .card').forEach(function (card) {
      var head = card.querySelector('.card-head');
      var text = head ? head.textContent : '';
      if (text.indexOf('Awaiting triage confirmation') !== -1) return;
      if (text.indexOf('Awaiting confirmation included') !== -1) return;
      rows = rows.concat(qa('table.data tbody tr', card));
    });
    return rows;
  }
  /* A chart counts as drawn when Chart.js painted the canvas, or when the
     built-in CSS fallback (bars, or an explicit "no data" note) is shown. */
  function isDrawn(box) {
    var canvas = box.querySelector('canvas');
    if (canvas && canvas.style.display !== 'none' && canvas.style.display !== 'hidden') return true;
    if (box.querySelector('.cf-row')) return true;
    var fallback = box.querySelector('.chart-fallback');
    return !!(fallback && /No data|unavailable|could not be drawn/i.test(fallback.textContent));
  }

  function summaryCount() {
    var node = q('#queue-summary');
    if (!node) return null;
    return { shown: Number(node.getAttribute('data-shown')), scope: Number(node.getAttribute('data-scope')) };
  }

  var activeCount = MediFlow.store.active().length;
  assert(queueRows().length === activeCount, 'the unfiltered queue lists every active patient (' + queueRows().length + ')');

  /* Search by ID — type it the way a user does, into a focused field. */
  var search = q('#q-search');
  search.focus();
  search.value = 'MF-1002';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(600);
  var matches = queueRows().filter(function (row) { return row.textContent.indexOf('MF-1002') !== -1; });
  assert(matches.length === 1, 'searching by patient ID narrows the queue to that patient [rows=' + queueRows().length + ']');
  assert(summaryCount() && summaryCount().shown === 1,
    'the result count reflects the filter [parsed=' + JSON.stringify(summaryCount()) + ']');
  assert(document.activeElement === q('#q-search'), 'the search box keeps focus while typing');

  /* Filter by priority (clear the search first so the two do not combine) */
  await click('[data-action="clear-filters"]');
  await sleep(420);
  var prioritySelect = q('#q-priority');
  prioritySelect.value = '1';
  prioritySelect.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(420);
  var level1Rows = queueRows();
  var level1Expected = MediFlow.store.active().filter(function (p) { return p.confirmedPriority === 1; }).length;
  assert(level1Rows.length === level1Expected && level1Expected > 0,
    'filtering by Level 1 returns exactly the Level 1 patients (' + level1Rows.length + ' of ' + level1Expected + ')');
  assert(level1Rows.every(function (row) { return row.textContent.indexOf('L1') !== -1; }), 'every row in a Level 1 filter shows a Level 1 patient');

  /* Filter by department */
  await click('[data-action="clear-filters"]');
  await sleep(420);
  var deptFilter = q('#q-department');
  deptFilter.value = 'Cardiology';
  deptFilter.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(420);
  var deptExpected = MediFlow.store.active().filter(function (p) { return p.department === 'Cardiology'; }).length;
  assert(queueRows().length === deptExpected && deptExpected > 0,
    'filtering by department returns exactly those patients (' + queueRows().length + ' of ' + deptExpected + ')');
  assert(queueRows().every(function (row) { return row.textContent.indexOf('Cardiology') !== -1; }), 'every row belongs to the chosen department');

  /* Filter by status (a completed patient is only visible when asked for) */
  await click('[data-action="clear-filters"]');
  await sleep(420);
  var statusFilter = q('#q-status');
  statusFilter.value = 'completed';
  statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(420);
  var completedExpected = MediFlow.store.all().filter(function (p) { return p.status === 'completed'; }).length;
  assert(queueRows().length === completedExpected && completedExpected > 0,
    'filtering by status shows the completed patients (' + queueRows().length + ' of ' + completedExpected + ')');
  assert(queueRows().every(function (row) { return row.textContent.indexOf('Completed') !== -1; }), 'every row carries the chosen status');

  /* Filter for patients still awaiting a staff decision */
  await click('[data-action="clear-filters"]');
  await sleep(420);
  var unconfirmedSelect = q('#q-priority');
  unconfirmedSelect.value = 'unconfirmed';
  unconfirmedSelect.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(420);
  var unconfirmedExpected = MediFlow.store.pendingTriage().length;
  assert(queueRows().length === unconfirmedExpected && unconfirmedExpected > 0,
    'the "awaiting confirmation" filter lists exactly the undecided patients (' + queueRows().length + ' of ' + unconfirmedExpected + ')');

  /* Back to the default view: the queue must never empty itself */
  await click('[data-action="clear-filters"]');
  await sleep(400);
  assert(q('#q-search').value === '', 'clearing the filters empties the search box');
  assert(q('#q-priority').value === '' && q('#q-status').value === 'active', 'the filter selects return to their defaults');
  assert(queueRows().length === activeCount, 'the queue shows every active patient again after clearing (' + queueRows().length + ')');
  assert(q('#view').textContent.indexOf('No patients match these filters') === -1, 'the queue is not reported as empty by mistake');

  /* The awaiting-confirmation strip is never hidden by the filters */
  search = q('#q-search');
  search.value = 'zzz-no-such-patient';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(600);
  assert(queueRows().length === 0, 'a search with no matches clears the queue tables');
  assert(q('#view').textContent.indexOf('MF-1015') !== -1, 'the awaiting-triage patient is still shown so nobody is lost');
  assert(q('#view').textContent.indexOf('No patients match these filters') !== -1, 'the empty state explains the situation');
  await click('[data-action="clear-filters"]');
  await sleep(400);

  /* ---------------------------------------------------------------- 5 */
  await go('#/register');
  assert(q('#register-form'), 'the registration form is present');
  assert(q('#name') && q('#age') && q('#symptoms') && q('#spo2'), 'the required fields and vitals exist');

  function fill(selector, value) {
    var node = q(selector);
    node.value = value;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }
  fill('#name', 'Browser Check Patient');
  fill('#age', '64');
  fill('#symptoms', 'Sudden chest pain spreading to the left arm with sweating this morning.');
  fill('#duration', '45 minutes');
  fill('#temperature', '36.9');
  fill('#pulse', '118');
  fill('#spo2', '92');
  fill('#systolic', '158');
  fill('#diastolic', '94');
  await sleep(420);

  var previewText = q('#triage-preview').textContent;
  assert(previewText.indexOf('EMERGENCY') !== -1, 'the live preview warns about the detected warning sign');
  assert(previewText.indexOf('Chest pain') !== -1, 'the warning sign is named in the preview');
  assert(previewText.indexOf('detected from the reported symptoms') !== -1, 'the preview explains that the sign was detected from the typed symptoms, not ticked by hand');
  assert(previewText.indexOf('immediate clinical assessment') !== -1, 'the preview tells staff to act immediately');
  assert(previewText.indexOf('Reasons') !== -1, 'the reasons for the suggestion are listed');
  assert(previewText.indexOf('does not diagnose') !== -1 || previewText.indexOf('diagnose') !== -1, 'the limitation is stated next to the suggestion');

  /* Save without confirming -> goes to the pending list */
  await click('[data-action="save-pending"]');
  await confirmDialog();
  var pendingNow = MediFlow.store.pendingTriage();
  assert(pendingNow.length >= 1, 'saving without confirmation places the patient in the awaiting-triage list');
  var pendingPatient = pendingNow.filter(function (p) { return p.name === 'Browser Check Patient'; })[0];
  assert(pendingPatient, 'the newly registered patient is the one awaiting confirmation');
  assert(pendingPatient.criticalAlert === true, 'the critical warning sign raised the alert flag');
  MediFlow.store.cancel(pendingPatient.id, { reason: 'Browser check cleanup.', staff: 'test' });

  /* ---------------------------------------------------------------- 6 */
  await go('#/register');
  fill('#name', 'Browser Check Patient 2');
  fill('#age', '52');
  fill('#symptoms', 'Severe abdominal pain with vomiting and unable to drink since last night.');
  fill('#duration', '10 hours');
  fill('#spo2', '97');
  await sleep(380);

  var suggestedText = q('#triage-preview').textContent;
  assert(suggestedText.indexOf('L2') !== -1 || suggestedText.indexOf('L1') !== -1, 'the live preview suggests a high priority');
  var suggestedLevel = MediFlow.triage.assess({
    symptoms: 'Severe abdominal pain with vomiting and unable to drink since last night.',
    symptomDuration: '10 hours', age: 52, source: 'emergency', vitals: { spo2: 97 }
  }, MediFlow.store.settings).suggestedLevel;

  await click('[data-action="review-save"]');
  var dialog = q('#modal-host .modal');
  assert(dialog, 'the confirmation dialog opened');
  assert(dialog.querySelectorAll('input[name="priority"]').length === 4, 'all four priority levels are offered');
  assert(dialog.querySelector('input[name="priority"]:checked').value === String(suggestedLevel), 'the suggestion is pre-selected');
  assert(dialog.querySelectorAll('.reason').length > 0, 'the reasons are repeated in the confirmation step');
  assert(dialog.textContent.indexOf('combined score') !== -1, 'the basis of the suggestion is shown in the confirmation step');
  await confirmDialog();

  var created = MediFlow.store.all().filter(function (p) { return p.name === 'Browser Check Patient 2'; })[0];
  assert(created, 'the patient was registered');
  assert(created.confirmedPriority === suggestedLevel, 'the staff-confirmed priority was stored');
  assert(created.suggestedPriority === suggestedLevel, 'the suggestion was stored separately');
  assert(window.location.hash.indexOf('#/patient/' + created.id) === 0, 'the app navigated to the new patient record');

  /* ---------------------------------------------------------------- 7 */
  var patientId = created.id;
  await sleep(200);
  var pageText = q('#view').textContent;
  assert(pageText.indexOf('Status & priority history') !== -1, 'the patient page shows the history');
  var queueIndexBefore = MediFlow.store.activeQueue().findIndex(function (p) { return p.id === patientId; });
  assert(queueIndexBefore >= 0, 'the patient is in the ordered queue after confirmation');

  /* Override the priority with a reason */
  await click('[data-action="priority"]');
  await sleep(200);
  var overrideDialog = q('#modal-host .modal');
  assert(overrideDialog, 'the priority dialog opened');
  await click('input[name="priority"][value="1"]', overrideDialog);
  await click('#modal-host [data-confirm]');
  await sleep(220);
  assert(q('#modal-host .modal'), 'the dialog stays open when the reason is missing');
  var shownErrors = qa('#modal-host .field-error')
    .map(function (node) { return (node.textContent || '').trim(); })
    .filter(function (text) { return text.length > 0; });
  assert(shownErrors.length > 0, 'the missing override reason is explained to the user');
  assert(shownErrors.join(' ').indexOf('reason') !== -1,
    'the message explains that a reason is required [errors=' + JSON.stringify(shownErrors) + ']');

  fill('#f-reason', 'Senior clinician reviewed the patient and escalated to immediate assessment.');
  await click('#modal-host [data-confirm]');
  await sleep(260);
  var overridden = MediFlow.store.get(patientId);
  assert(overridden.confirmedPriority === 1, 'the override was saved');
  assert(overridden.suggestedPriority === suggestedLevel, 'the original suggestion is preserved');
  assert(overridden.overrideReason.length > 10, 'the override reason was stored');
  var reordered = MediFlow.store.activeQueue();
  var newIndex = reordered.findIndex(function (p) { return p.id === patientId; });
  var firstLowerPriority = reordered.findIndex(function (p) { return p.confirmedPriority > 1; });
  assert(newIndex >= 0, 'the patient is still in the queue');
  assert(newIndex < queueIndexBefore, 'escalating the patient moved them further up the queue');
  assert(firstLowerPriority === -1 || newIndex < firstLowerPriority, 'the escalated patient is ahead of every lower priority patient');
  assert(q('#view').textContent.indexOf('Priority was overridden by staff') !== -1, 'the override and its reason are visible on the record');

  /* ---------------------------------------------------------------- 8 */
  await go('#/patient/' + patientId);
  await click('[data-action="start"]');
  await confirmDialog();
  assert(MediFlow.store.get(patientId).status === 'in_consultation', 'the patient moved to In Consultation');
  assert(q('#view').textContent.indexOf('In Consultation') !== -1, 'the new status is shown on the record');

  await click('[data-action="complete"]');
  await confirmDialog();
  assert(MediFlow.store.get(patientId).status === 'completed', 'the patient was marked Completed');
  assert(MediFlow.store.activeQueue().every(function (p) { return p.id !== patientId; }), 'the completed patient left the live queue');

  /* Reassessment control on another patient */
  var someone = MediFlow.store.activeQueue()[0];
  await go('#/patient/' + someone.id);
  await click('[data-action="note"]');
  await sleep(160);
  fill('#f-text', 'Browser check: staff note recorded.');
  await confirmDialog();
  assert(MediFlow.store.get(someone.id).notes.length >= 1, 'a staff note was recorded');

  /* Impossible actions are disabled AND explained, never silently broken. */
  var disabledControls = qa('#view [aria-disabled="true"]');
  assert(disabledControls.length >= 1, 'a status move that is not possible is disabled');
  assert(disabledControls.every(function (node) { return (node.getAttribute('title') || '').length > 10; }),
    'every disabled control explains why it is disabled');

  /* Assign a department through the dialog */
  await click('[data-action="department"]');
  await sleep(200);
  var deptDialog = q('#modal-host .modal');
  assert(deptDialog && deptDialog.querySelector('#f-department'), 'the department dialog offers a department list');
  var deptSelect = deptDialog.querySelector('#f-department');
  deptSelect.value = 'ENT';
  await click('#modal-host [data-confirm]');
  await sleep(240);
  assert(MediFlow.store.get(someone.id).department === 'ENT', 'the department assignment was saved');
  assert(MediFlow.store.get(someone.id).history.some(function (h) { return h.type === 'department_changed'; }), 'the department change is in the history');

  /* Flag for reassessment, then return to waiting */
  await click('[data-action="reassess"]');
  await confirmDialog();
  assert(MediFlow.store.get(someone.id).status === 'reassessment', 'the patient was flagged Reassessment Required');
  assert(q('#view').textContent.indexOf('Reassessment') !== -1, 'the reassessment status is shown on the record');

  await click('[data-action="resume"]');
  await confirmDialog();
  assert(MediFlow.store.get(someone.id).status === 'waiting', 'the patient was moved back to Waiting');

  /* Cancel a registration – the reason is mandatory */
  await click('[data-action="cancel"]');
  await sleep(220);
  assert(q('#modal-host .modal'), 'the cancel-registration dialog opened');
  await click('#modal-host [data-confirm]');
  await sleep(220);
  assert(q('#modal-host .modal'), 'cancelling without a reason is refused');
  fill('#f-reason', 'Duplicate registration – the patient is already in the queue.');
  await click('#modal-host [data-confirm]');
  await sleep(280);
  var cancelled = MediFlow.store.get(someone.id);
  assert(cancelled.status === 'cancelled', 'the registration was cancelled');
  assert(cancelled.cancelReason.length > 10, 'the cancellation reason was recorded');
  assert(MediFlow.store.activeQueue().every(function (p) { return p.id !== someone.id; }), 'a cancelled patient leaves the live queue');
  assert(window.location.hash === '#/queue', 'after cancelling, the app returns to the queue');

  /* ---------------------------------------------------------------- 9 */
  await go('#/triage');
  assert(q('#view').textContent.indexOf('Awaiting staff confirmation') !== -1, 'the triage page lists pending confirmations');
  var firstPending = MediFlow.store.pendingTriage()[0];
  assert(firstPending, 'a pending patient exists for the demo');
  assert(q('[data-action="priority"]'), 'pending patients offer a confirm-priority button');
  assert(q('#view').textContent.indexOf('Age is never used on its own') !== -1, 'the safety rules are explained on the page');

  /* -------------------------------------------------------------- 10 */
  await go('#/analytics');
  assert(q('#chart-urgency') && q('#chart-department') && q('#chart-status') && q('#chart-throughput'), 'all four analytics charts exist');
  var analyticsBoxes = qa('.chart-box');
  var analyticsDrawn = analyticsBoxes.filter(isDrawn);
  assert(analyticsDrawn.length === analyticsBoxes.length,
    'every analytics chart is drawn (' + analyticsDrawn.length + ' of ' + analyticsBoxes.length + ')');
  var analyticsText = q('#view').textContent;
  assert(analyticsText.indexOf('Registered today') !== -1, 'registrations today are shown');
  assert(analyticsText.indexOf('by urgency level') !== -1, 'patients by urgency are shown');
  assert(analyticsText.indexOf('Patients by department') !== -1, 'patients by department are shown');
  assert(analyticsText.indexOf('Waiting versus completed') !== -1, 'waiting versus completed is shown');
  assert(analyticsText.indexOf('Simulated statistics') !== -1, 'demo statistics are clearly identified');

  /* -------------------------------------------------------------- 11 */
  await go('#/settings');
  assert(q('#set-rooms'), 'the settings page offers operational configuration');
  var flagRows = qa('.cfg-table tbody tr');
  assert(flagRows.length >= 5, 'the configurable warning-sign list is editable (' + flagRows.length + ' rows)');
  var addButton = q('[data-action="add-flag"]');
  assert(addButton, 'warning signs can be added');
  await click('[data-action="add-flag"]');
  await sleep(240);
  assert(qa('.cfg-table tbody tr').length === flagRows.length + 1, 'adding a warning sign adds a row');
  var addedRows = qa('[data-action="remove-flag"]');
  await clickNode(addedRows[addedRows.length - 1]);
  await sleep(200);
  await confirmDialog();
  assert(qa('.cfg-table tbody tr').length === flagRows.length, 'the extra warning sign was removed again');

  fill('#set-rooms', '4');
  await click('[data-action="save-operations"]');
  await sleep(260);
  assert(MediFlow.store.settings.consultRooms === 4, 'operational settings are saved');

  /* -------------------------------------------------------------- 12 */
  await go('#/dashboard');
  assert(q('#view').textContent.indexOf('Live dashboard') !== -1, 'the dashboard renders again after the full workflow');
  await click('[data-action="refresh"]');
  await sleep(260);
  assert(q('#view .stat-value'), 'the refresh control works');

  /* Data survives a reload */
  assert(!!window.localStorage.getItem(MediFlow.config.STORAGE.key), 'the state is persisted in browser storage');

  return steps;
})()`;

/* -------------------------------- runner -------------------------------- */

(async function main() {
  const browserPath = findBrowser();
  if (!browserPath) {
    console.error('Could not find Chrome or Edge. Set CHROME_PATH and try again.');
    process.exit(2);
  }

  /* The server must be up before we start. */
  try {
    await waitForOk(URL_BASE + 'js/app.js', 8000);
  } catch (error) {
    console.error('MediFlow is not reachable at ' + URL_BASE);
    console.error('Start it first:  node server.js 4173');
    process.exit(2);
  }

  const profileDir = path.join(os.tmpdir(), 'mediflow-browser-check-' + Date.now());
  const child = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-features=Translate,BackForwardCache',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + profileDir,
    'about:blank'
  ], { stdio: 'ignore' });

  let exitCode = 0;

  try {
    const version = await waitForJson('http://127.0.0.1:' + DEBUG_PORT + '/json/version', 20000);
    console.log('Browser: ' + version.Browser);

    const targets = await waitForJson('http://127.0.0.1:' + DEBUG_PORT + '/json/list', 10000);
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('No page target available');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('Could not connect to the browser debugger')), { once: true });
    });

    const cdp = new Cdp(ws);
    const consoleErrors = [];
    const pageExceptions = [];

    cdp.on((message) => {
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        pageExceptions.push(details.exception ? (details.exception.description || details.exception.value) : details.text);
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '));
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        const text = message.params.entry.text || '';
        /* A missing CDN (offline) is handled by design, not a defect. */
        if (!/chart\.js|net::ERR|Failed to load resource/i.test(text)) consoleErrors.push(text);
      }
    });

    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');

    const loaded = new Promise((resolve) => {
      cdp.on((message) => { if (message.method === 'Page.loadEventFired') resolve(); });
    });
    await cdp.send('Page.navigate', { url: URL_BASE });
    await loaded;
    await sleep(700);

    const evaluation = await cdp.send('Runtime.evaluate', {
      expression: WORKFLOW,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });

    if (evaluation.exceptionDetails) {
      const details = evaluation.exceptionDetails;
      console.error('\n\u2717 The browser workflow failed:');
      console.error('  ' + (details.exception && (details.exception.description || details.exception.value) || details.text));
      exitCode = 1;
    } else {
      const steps = evaluation.result.value || [];
      console.log('');
      steps.forEach((step) => console.log('  ' + step.replace(/^PASS /, '\u2713 ')));
      console.log('\n' + steps.length + ' browser checks passed.');
    }

    if (pageExceptions.length) {
      console.error('\n\u2717 Uncaught JavaScript errors in the page:');
      pageExceptions.forEach((item) => console.error('  • ' + item));
      exitCode = 1;
    } else {
      console.log('  \u2713 no uncaught JavaScript errors during the whole run');
    }

    const relevant = consoleErrors.filter((text) => !/favicon/i.test(text));
    if (relevant.length) {
      console.error('\n\u2717 console.error output:');
      relevant.forEach((item) => console.error('  • ' + item));
      exitCode = 1;
    } else {
      console.log('  \u2713 nothing logged to console.error');
    }

    /* ---------- responsive layout across phone / tablet / laptop ---------- */
    const evaluate = async (expression) => {
      const outcome = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (outcome.exceptionDetails) throw new Error(outcome.exceptionDetails.text || 'evaluation failed');
      return outcome.result.value;
    };
    const setViewport = (width, height, mobile) =>
      cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });

    const PAGES = ['#/dashboard', '#/queue', '#/register', '#/analytics'];
    for (const bp of [
      { name: 'phone 390x844', width: 390, height: 844, mobile: true, menu: true },
      { name: 'tablet 820x1180', width: 820, height: 1180, mobile: true, menu: true },
      { name: 'laptop 1440x900', width: 1440, height: 900, mobile: false, menu: false }
    ]) {
      await setViewport(bp.width, bp.height, bp.mobile);
      await sleep(320);
      const overflow = [];
      for (const hash of PAGES) {
        const amount = await evaluate(
          '(async function(){window.location.hash=' + JSON.stringify(hash) +
          ';await new Promise(function(r){setTimeout(r,340);});' +
          'return document.documentElement.scrollWidth - window.innerWidth;})()'
        );
        if (amount > 2) overflow.push(hash + ' overflows by ' + amount + 'px');
      }
      const menuDisplay = await evaluate("getComputedStyle(document.querySelector('#menu-btn')).display");
      const menuOk = bp.menu ? menuDisplay !== 'none' : menuDisplay === 'none';
      if (!overflow.length && menuOk) {
        console.log('  \u2713 ' + bp.name + ' — no horizontal overflow on 4 pages, navigation control ' + (bp.menu ? 'shown' : 'hidden') + ' as expected');
      } else {
        exitCode = 1;
        console.error('  \u2717 ' + bp.name + ' — ' + (overflow.length ? overflow.join(', ') : 'unexpected navigation control visibility (' + menuDisplay + ')'));
      }
    }

    /* The off-canvas drawer must actually open on a phone-sized screen. */
    await setViewport(390, 844, true);
    await sleep(260);
    const drawer = await evaluate(
      "(async function(){document.querySelector('#menu-btn').click();" +
      "await new Promise(function(r){setTimeout(r,340);});" +
      "return {open:document.body.classList.contains('nav-open')," +
      "left:Math.round(document.querySelector('#sidebar').getBoundingClientRect().left)," +
      "scrim:!document.querySelector('#scrim').hidden};})()"
    );
    if (drawer && drawer.open && drawer.left >= 0 && drawer.scrim) {
      console.log('  \u2713 the mobile navigation drawer opens over the content and can be dismissed');
    } else {
      exitCode = 1;
      console.error('  \u2717 the mobile navigation drawer did not open as expected ' + JSON.stringify(drawer));
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    try { ws.close(); } catch (error) { /* ignore */ }
  } catch (error) {
    console.error('\n\u2717 ' + error.message);
    exitCode = 1;
  } finally {
    try { child.kill('SIGKILL'); } catch (error) { /* ignore */ }
    await sleep(200);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (error) { /* ignore */ }
  }

  console.log('');
  process.exit(exitCode);
})();
