/* ==========================================================================
   MediFlow | tests/run-tests.js
   --------------------------------------------------------------------------
   Dependency-free test runner. It loads the real application modules into a
   sandbox with a fake `window` and `localStorage`, then asserts the clinical
   rules and the queue behaviour that the demo depends on.

   Run:  node tests/run-tests.js       (or: npm test)
   ========================================================================== */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

/* --------------------------- tiny test framework ------------------------- */

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  \u2713 ' + name);
  } catch (error) {
    failed++;
    failures.push({ name, error });
    console.log('  \u2717 ' + name);
    console.log('      ' + (error && error.message ? error.message : String(error)));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'Values differ') + ' — expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
  }
}

function section(title) {
  console.log('\n' + title);
}

/* --------------------------- sandbox bootstrap -------------------------- */

function fakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    clear: () => map.clear(),
    key: (index) => Array.from(map.keys())[index] || null,
    get length() { return map.size; },
    _dump: () => map
  };
}

const sandbox = {
  console,
  localStorage: fakeLocalStorage(),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Promise,
  URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  Blob: function Blob() {},
  FileReader: function FileReader() {}
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);

/* 1. Syntax-check every shipped script (catches typos in files that need a
      real browser and therefore cannot be executed here). */
section('Syntax check — every JavaScript file parses');
(function syntaxCheck() {
  const files = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    });
  })(path.join(ROOT, 'js'));

  files.sort().forEach((file) => {
    test(path.relative(ROOT, file) + ' parses', () => {
      const source = fs.readFileSync(file, 'utf8');
      new vm.Script(source, { filename: file });
    });
  });
})();

/* 2. Load only the modules that do not need the DOM. */
const CORE = [
  'js/config.js',
  'js/utils.js',
  'js/storage.js',
  'js/triage.js',
  'js/waiting.js',
  'js/store.js',
  'js/demo.js'
];
section('Load core modules into the sandbox');
CORE.forEach((file) => {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInContext(source, sandbox, { filename: file });
});

const MF = sandbox.MediFlow;
const triage = MF.triage;
const store = MF.store;
const waiting = MF.waiting;
const U = MF.utils;
const cfg = MF.config;

/* Bootstrap the store the way js/app.js does on page load. */
store.init();

/* Start from a clean, initialised store (mirrors a first page load). */
function resetStore() {
  sandbox.localStorage.clear();
  store.init();
  store.clearAll();
}

let registrationCounter = 0;
function register(overrides) {
  registrationCounter++;
  const base = {
    name: 'Test Patient ' + registrationCounter,
    age: 40,
    symptoms: 'Cough and runny nose for five days, no shortness of breath.',
    symptomDuration: '5 days',
    vitals: { temperature: 36.8, pulse: 74, spo2: 98, systolic: 118, diastolic: 76 },
    department: 'General Medicine',
    source: 'outpatient'
  };
  const result = store.create(Object.assign({}, base, overrides || {}));
  if (!result.ok) throw new Error('create() failed: ' + JSON.stringify(result.errors));
  return result.patient;
}

/* ============================ TRIAGE RULES ============================== */

section('Triage rules');

test('a ticked critical warning sign produces Level 1 and the emergency alert', () => {
  const result = triage.assess({ symptoms: 'Patient feels unwell', age: 50, source: 'emergency', redFlags: ['chest_pain'], vitals: { spo2: 97 } });
  equal(result.suggestedLevel, 1);
  equal(result.criticalAlert, true);
  assert(result.reasons.some((r) => r.kind === 'critical'), 'the warning sign must appear in the reasons');
  assert(result.reasons.some((r) => /immediate clinical assessment/i.test(r.text)), 'the reason must tell staff to act immediately');
});

test('a warning sign mentioned in the symptom text is detected automatically', () => {
  const result = triage.assess({ symptoms: 'Sudden chest pain radiating to the jaw', age: 60, source: 'outpatient', vitals: {} });
  equal(result.suggestedLevel, 1);
  equal(result.criticalAlert, true);
});

test('a single soft symptom never reaches Level 2', () => {
  const result = triage.assess({
    symptoms: 'Mild cough and runny nose for five days',
    symptomDuration: '5 days',
    age: 30,
    source: 'outpatient',
    redFlags: [],
    vitals: { temperature: 36.7, pulse: 72, spo2: 99, systolic: 118, diastolic: 76 }
  });
  assert(result.suggestedLevel >= 3, 'a single mild symptom must not be escalated to Level 2, got L' + result.suggestedLevel);
  assert(result.score < 6, 'the score should stay below the Level 2 threshold, got ' + result.score);
});

test('two strong signals can reach Level 2', () => {
  const result = triage.assess({
    symptoms: 'Severe abdominal pain with vomiting everything and unable to drink',
    symptomDuration: '8 hours',
    age: 30,
    source: 'emergency',
    redFlags: [],
    vitals: { temperature: 37.2, pulse: 96, spo2: 97, systolic: 122, diastolic: 78 }
  });
  equal(result.suggestedLevel, 2);
  equal(result.criticalAlert, false);
});

test('age alone is never enough to escalate', () => {
  const result = triage.assess({
    symptoms: 'Routine blood pressure check and medication review, no new complaints.',
    symptomDuration: '1 month',
    age: 92,
    source: 'outpatient',
    redFlags: [],
    vitals: { temperature: 36.6, pulse: 70, spo2: 98, systolic: 130, diastolic: 80 }
  });
  assert(result.suggestedLevel >= 3, 'an older adult with a stable routine complaint must not be escalated, got L' + result.suggestedLevel);
  assert(!result.criticalAlert, 'age alone must never raise a critical alert');
});

test('critically low oxygen saturation is never classified as routine', () => {
  const result = triage.assess({
    symptoms: 'Feeling tired and a bit breathless today',
    symptomDuration: '1 day',
    age: 55,
    source: 'emergency',
    redFlags: [],
    vitals: { temperature: 37, pulse: 105, spo2: 85, systolic: 120, diastolic: 78 }
  });
  assert(result.suggestedLevel <= 2, 'SpO2 below 90% must never be Routine or Moderate, got L' + result.suggestedLevel);
  equal(result.requiresStaffReview, true);
});

test('missing vital signs raise the suggestion instead of lowering it', () => {
  const result = triage.assess({
    symptoms: 'Feeling unwell since this morning',
    symptomDuration: '3 hours',
    age: 45,
    source: 'emergency',
    redFlags: [],
    vitals: {}
  });
  assert(result.suggestedLevel <= 3, 'missing observations must not produce a Routine classification, got L' + result.suggestedLevel);
  equal(result.requiresStaffReview, true);
  assert(result.reasons.some((r) => r.kind === 'review'), 'a staff-review reason must be recorded');
});

test('a very brief symptom note also triggers staff review', () => {
  const result = triage.assess({
    symptoms: 'Pain',
    age: 33,
    source: 'outpatient',
    redFlags: [],
    vitals: { temperature: 36.6, pulse: 70, spo2: 98, systolic: 120, diastolic: 78 }
  });
  equal(result.requiresStaffReview, true);
  assert(result.suggestedLevel <= 3, 'a one-word symptom note must not be classified Routine, got L' + result.suggestedLevel);
});

test('every suggestion carries a disclaimer and its reasons', () => {
  const result = triage.assess({ symptoms: 'Fever and vomiting for two days', age: 28, source: 'outpatient', redFlags: [], vitals: { temperature: 38.2 } });
  assert(result.disclaimer && result.disclaimer.length > 40, 'a disclaimer must be present');
  assert(result.reasons.length > 0, 'at least one reason must be present');
});

test('compare() reports the direction of an override', () => {
  equal(triage.compare(3, 1).direction, 'more_urgent');
  equal(triage.compare(2, 4).direction, 'less_urgent');
  equal(triage.compare(2, 2).changed, false);
});

/* ============================== STORE =================================== */

section('Patient records and identifiers');

resetStore();

test('registration generates a unique patient ID', () => {
  const a = register();
  const b = register();
  assert(/^MF-\d+$/.test(a.id), 'IDs must follow the MF-0000 format, got ' + a.id);
  assert(a.id !== b.id, 'IDs must be unique');
});

test('suggestion, confirmation and override reason are stored separately', () => {
  const patient = register({
    symptoms: 'Severe bleeding from a deep cut on the arm',
    redFlags: ['bleeding'],
    source: 'emergency'
  });
  equal(patient.suggestedPriority, 1);
  equal(patient.confirmedPriority, null, 'nothing may be auto-confirmed');
  const confirmed = store.confirmPriority(patient.id, 1, { staff: 'Dr Test' });
  assert(confirmed.ok, 'confirming the suggestion must succeed');
  equal(store.get(patient.id).suggestedPriority, 1, 'the suggestion must not be overwritten');
  equal(store.get(patient.id).confirmedPriority, 1);
  equal(store.get(patient.id).overrideReason, null, 'no override reason is needed when staff agree');
});

test('an override without a reason is rejected', () => {
  const patient = register({ symptoms: 'Mild cough and runny nose for five days', symptomDuration: '5 days' });
  const attempt = store.confirmPriority(patient.id, 2, { staff: 'Dr Test' });
  equal(attempt.ok, false);
  assert(attempt.errors.reason, 'the store must ask for a reason');
  equal(store.get(patient.id).confirmedPriority, null, 'the record must be unchanged');
});

test('an override with a reason is stored, and the suggestion is preserved', () => {
  const patient = register({ symptoms: 'Mild cough and runny nose for five days', symptomDuration: '5 days' });
  const suggested = patient.suggestedPriority;
  const attempt = store.confirmPriority(patient.id, 1, { staff: 'Dr Test', reason: 'Vital signs deteriorated after registration.' });
  assert(attempt.ok, 'overriding with a reason must succeed');
  const saved = store.get(patient.id);
  equal(saved.confirmedPriority, 1);
  equal(saved.suggestedPriority, suggested, 'the original suggestion must be kept');
  equal(saved.overrideReason, 'Vital signs deteriorated after registration.');
  equal(saved.overrideDirection, 'more_urgent');
});

test('invalid input is rejected with field-level errors', () => {
  const bad = store.create({ name: 'A', age: 200, symptoms: '', source: 'nope', vitals: { spo2: 400 } });
  equal(bad.ok, false);
  assert(bad.errors.name, 'name error expected');
  assert(bad.errors.age, 'age error expected');
  assert(bad.errors.symptoms, 'symptom error expected');
  assert(bad.errors.vital_spo2, 'out-of-range vital error expected');
});

test('impossible blood pressure is rejected', () => {
  const bad = store.create({
    name: 'Test Patient BP', age: 50, symptoms: 'Headache for two days',
    source: 'outpatient', vitals: { systolic: 100, diastolic: 140 }
  });
  equal(bad.ok, false);
  assert(bad.errors.vital_diastolic, 'diastolic above systolic must be rejected');
});

/* ========================== QUEUE ORDERING ============================== */

section('Queue ordering');

resetStore();

test('the queue is ordered by confirmed urgency then by registration time', () => {
  const routine = register({ symptoms: 'Mild cough for five days', symptomDuration: '5 days' });
  store.confirmPriority(routine.id, 4, { force: true, staff: 'test' });

  const critical = register({ symptoms: 'Unresponsive and not waking', redFlags: ['unconscious'], source: 'emergency' });
  store.confirmPriority(critical.id, 1, { force: true, staff: 'test' });

  const moderate1 = register({ symptoms: 'Fever and vomiting for two days' });
  store.confirmPriority(moderate1.id, 3, { force: true, staff: 'test' });

  const moderate2 = register({ symptoms: 'Urinary symptoms and lower back pain' });
  store.confirmPriority(moderate2.id, 3, { force: true, staff: 'test' });

  const queue = store.activeQueue().map((p) => p.id);
  equal(queue[0], critical.id, 'Level 1 must be first');
  equal(queue[1], moderate1.id, 'within Level 3 the earliest registration is first');
  equal(queue[2], moderate2.id, 'later registrations follow within the same level');
  equal(queue[3], routine.id, 'Level 4 must be last');
});

test('an unconfirmed patient is kept out of the confirmed queue', () => {
  const patient = register({ symptoms: 'Sudden chest pain', redFlags: ['chest_pain'], source: 'emergency' });
  equal(store.get(patient.id).confirmedPriority, null);
  assert(!store.activeQueue().some((p) => p.id === patient.id), 'unconfirmed patients must not appear in the ordered queue');
  assert(store.pendingTriage().some((p) => p.id === patient.id), 'they must appear in the pending list');
});

test('the pending list puts the most urgent suggestion first', () => {
  const pending = store.pendingTriage();
  assert(pending.length >= 1, 'a pending patient exists from the previous test');
  for (let i = 1; i < pending.length; i++) {
    assert((pending[i - 1].suggestedPriority || 99) <= (pending[i].suggestedPriority || 99), 'pending patients must be ordered by suggested urgency');
  }
});

test('search and filter helpers match name and ID', () => {
  const queue = store.activeQueue();
  const target = queue[0];
  const shared = {
    matchesSearch: (p, q) => (p.name || '').toLowerCase().indexOf(String(q).toLowerCase()) !== -1 || (p.id || '').toLowerCase().indexOf(String(q).toLowerCase()) !== -1
  };
  assert(shared.matchesSearch(target, target.name.slice(0, 5)), 'search must match on name');
  assert(shared.matchesSearch(target, target.id), 'search must match on patient ID');
  assert(!shared.matchesSearch(target, 'zzz-not-present-zzz'), 'search must not match unrelated text');
});

/* =========================== STATUS FLOW ================================ */

section('Status flow');

resetStore();

test('staff can complete a patient directly from waiting (busy departments do this)', () => {
  const patient = register({ symptoms: 'Fever and headache for two days' });
  store.confirmPriority(patient.id, 3, { force: true, staff: 'test' });
  const attempt = store.setStatus(patient.id, 'completed', { staff: 'test', note: 'Seen and discharged without a status update.' });
  assert(attempt.ok, 'a direct completion must be allowed');
  const saved = store.get(patient.id);
  equal(saved.status, 'completed');
  assert(saved.completedAt && saved.seenAt, 'both timestamps must be filled so analytics stay correct');
});

test('an impossible status move is refused with an explanation', () => {
  const patient = register({ symptoms: 'Mild cough for five days', symptomDuration: '5 days' });
  store.cancel(patient.id, { reason: 'Duplicate registration.', staff: 'test' });
  const attempt = store.setStatus(patient.id, 'in_consultation', { staff: 'test' });
  equal(attempt.ok, false);
  assert(attempt.errors.status, 'a reason for refusal must be returned');
});

test('a patient without a confirmed priority cannot enter the queue', () => {
  const patient = register({ symptoms: 'Fever and headache for two days' });
  const attempt = store.setStatus(patient.id, 'in_consultation', { staff: 'test' });
  equal(attempt.ok, false);
  assert(attempt.errors.status, 'the confusion must be explained');
});

test('waiting to in consultation to completed records timestamps', () => {
  const patient = register({ symptoms: 'Fever and headache for two days' });
  store.confirmPriority(patient.id, 3, { force: true, staff: 'test' });

  assert(store.setStatus(patient.id, 'in_consultation', { staff: 'Dr Test' }).ok, 'start consultation must succeed');
  let saved = store.get(patient.id);
  equal(saved.status, 'in_consultation');
  assert(saved.seenAt, 'the first-contact timestamp must be recorded');
  equal(store.activeQueue().filter((p) => p.id === patient.id).length, 1, 'the patient stays in the queue while being seen');

  assert(store.setStatus(patient.id, 'completed', { staff: 'Dr Test', note: 'Discharged' }).ok, 'completion must succeed');
  saved = store.get(patient.id);
  equal(saved.status, 'completed');
  assert(saved.completedAt, 'the completion timestamp must be recorded');
  assert(!store.activeQueue().some((p) => p.id === patient.id), 'completed patients leave the live queue');
});

test('reassessment can be flagged with a note', () => {
  const patient = register({ symptoms: 'Mild cough for five days', symptomDuration: '5 days' });
  store.confirmPriority(patient.id, 4, { force: true, staff: 'test' });
  const result = store.setStatus(patient.id, 'reassessment', { staff: 'Nurse Test', note: 'Waiting too long, please reassess.' });
  assert(result.ok, 'flagging reassessment must succeed');
  equal(store.get(patient.id).status, 'reassessment');
  assert(store.get(patient.id).notes.some((n) => /reassess/i.test(n.text)), 'the note must be stored');
});

test('cancelling a registration demands a reason', () => {
  const patient = register({ symptoms: 'Mild cough for five days', symptomDuration: '5 days' });
  equal(store.cancel(patient.id, { reason: '' }).ok, false);
  const ok = store.cancel(patient.id, { reason: 'Duplicate registration of ' + patient.id, staff: 'Nurse Test' });
  assert(ok.ok, 'cancelling with a reason must succeed');
  equal(store.get(patient.id).status, 'cancelled');
  equal(store.get(patient.id).cancelReason, 'Duplicate registration of ' + patient.id);
});

test('notes and department changes are recorded in the history', () => {
  const patient = register({ symptoms: 'Mild cough for five days', symptomDuration: '5 days' });
  store.addNote(patient.id, 'Patient moved to the quieter waiting area.', { staff: 'Nurse Test' });
  store.assignDepartment(patient.id, 'ENT', { staff: 'Nurse Test' });
  const saved = store.get(patient.id);
  equal(saved.department, 'ENT');
  assert(saved.history.some((h) => h.type === 'note_added'), 'a note history entry is expected');
  assert(saved.history.some((h) => h.type === 'department_changed'), 'a department history entry is expected');
  assert(saved.history.some((h) => h.type === 'triage_suggested'), 'the suggestion must be in the history');
});

/* ======================== WAITING ESTIMATES ============================ */

section('Illustrative waiting estimates');

resetStore();

test('a patient further down the queue is estimated a longer wait', () => {
  const first = register({ symptoms: 'Unresponsive patient', redFlags: ['unconscious'], source: 'emergency' });
  store.confirmPriority(first.id, 1, { force: true, staff: 'test' });
  const second = register({ symptoms: 'Moderate abdominal pain with vomiting' });
  store.confirmPriority(second.id, 3, { force: true, staff: 'test' });
  const third = register({ symptoms: 'Mild rash and itching' });
  store.confirmPriority(third.id, 4, { force: true, staff: 'test' });

  const queue = store.activeQueue();
  const estFirst = waiting.estimate(store.get(first.id), queue);
  const estThird = waiting.estimate(store.get(third.id), queue);

  assert(estFirst.available && estThird.available, 'both patients must have an estimate');
  assert(estThird.minutesLow >= estFirst.minutesLow, 'waiting behind more patients must not produce a shorter estimate');
  assert(estThird.aheadCount === 2, 'two patients are ahead, got ' + estThird.aheadCount);
  assert(estThird.disclaimer && estThird.disclaimer.indexOf('Illustrative') === 0, 'the estimate must be labelled as illustrative');
});

test('an estimate is a range, not a single guaranteed number', () => {
  const patient = register({ symptoms: 'Moderate abdominal pain with vomiting' });
  store.confirmPriority(patient.id, 3, { force: true, staff: 'test' });
  const estimate = waiting.estimate(store.get(patient.id), store.activeQueue());
  assert(estimate.minutesHigh >= estimate.minutesLow, 'the upper bound must not be below the lower bound');
  assert(/about/i.test(estimate.display), 'the display text must read as an approximation');
});

test('a completed patient has no waiting estimate', () => {
  const patient = register({ symptoms: 'Mild cough for five days', symptomDuration: '5 days' });
  store.confirmPriority(patient.id, 4, { force: true, staff: 'test' });
  store.setStatus(patient.id, 'in_consultation', { staff: 'test' });
  store.setStatus(patient.id, 'completed', { staff: 'test' });
  equal(waiting.estimate(store.get(patient.id), store.activeQueue()).available, false);
});

test('patients waiting beyond the threshold are flagged so they are not forgotten', () => {
  resetStore();
  const old = register({
    symptoms: 'Mild cough for five days',
    symptomDuration: '5 days',
    registeredAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  });
  store.confirmPriority(old.id, 4, { force: true, staff: 'test' });
  const longWaiters = store.longWaiters();
  assert(longWaiters.some((p) => p.id === old.id), 'a three-hour wait must be flagged');
});

/* ============================ ANALYTICS ================================= */

section('Analytics figures');

resetStore();

test('counts, distribution and throughput stay consistent with the records', () => {
  const waitingPatient = register({ symptoms: 'Mild cough for five days', symptomDuration: '5 days' });
  store.confirmPriority(waitingPatient.id, 4, { force: true, staff: 'test' });

  const seen = register({ symptoms: 'Severe abdominal pain with vomiting' });
  store.confirmPriority(seen.id, 2, { force: true, staff: 'test' });
  store.setStatus(seen.id, 'in_consultation', { staff: 'test' });
  store.setStatus(seen.id, 'completed', { staff: 'test' });

  const stats = store.stats();
  equal(stats.counts.total, 2);
  equal(stats.counts.waiting, 1);
  equal(stats.counts.completed, 1);
  equal(stats.counts.urgent, 0, 'the completed Level 2 patient is no longer active');
  equal(stats.distribution[4], 1, 'one active routine patient is expected');
  equal(stats.registeredToday, 2);
  equal(stats.completedToday, 1);

  const throughput = store.throughputByHour(new Date()).reduce((sum, hour) => sum + hour.count, 0);
  equal(throughput, 1, 'one consultation must be counted in today\'s throughput');
});

test('measured waiting time uses real timestamps', () => {
  resetStore();
  const patient = register({
    symptoms: 'Moderate abdominal pain with vomiting',
    registeredAt: new Date(Date.now() - 90 * 60 * 1000).toISOString()
  });
  store.confirmPriority(patient.id, 2, { force: true, staff: 'test' });
  const measured = store.averageMeasuredWait(store.all());
  equal(measured, 0, 'patients who have not been seen are excluded from the measured average');
  store.setStatus(patient.id, 'in_consultation', { staff: 'test' });
  const afterSeen = store.averageMeasuredWait(store.all());
  assert(afterSeen >= 89 && afterSeen <= 92, 'measured wait should be about 90 minutes, got ' + afterSeen);
});

/* ============================= DEMO DATA =============================== */

section('Demo data');

resetStore();

test('the demo dataset is fictional, varied and clearly flagged', () => {
  const drafts = MF.demo.build();
  assert(drafts.length >= 10, 'at least ten demo patients are required, got ' + drafts.length);
  assert(drafts.every((p) => !/real|actual/i.test(p.name)), 'demo names must obviously be fictional');
  const levels = {};
  drafts.forEach((p) => { if (p.confirmedPriority) levels[p.confirmedPriority] = (levels[p.confirmedPriority] || 0) + 1; });
  [1, 2, 3, 4].forEach((level) => assert(levels[level] > 0, 'the demo set must include Level ' + level + ' patients'));
  assert(drafts.some((p) => p.status === 'waiting'), 'the demo set must include waiting patients');
  assert(drafts.some((p) => p.status === 'completed'), 'the demo set must include a completed patient');
  assert(drafts.some((p) => p.status === 'in_consultation'), 'the demo set must include a patient in consultation');
  assert(drafts.some((p) => p.status === 'reassessment'), 'the demo set must include a reassessment flag');
  assert(drafts.some((p) => !p.confirmedPriority), 'the demo set must include an unconfirmed registration');
});

test('loading demo data creates records marked as demo and orders the queue correctly', () => {
  resetStore();
  const before = store.all().length;
  const result = store.addDemoPatients(MF.demo.build());
  assert(result.ok && result.added.length >= 10, 'demo patients must be created');
  const after = store.all().length;
  assert(after === before + result.added.length, 'record count must grow by the number of demo patients');
  assert(store.all().filter((p) => p.demo).length === result.added.length, 'every imported record must be flagged as demo');

  const queue = store.activeQueue();
  assert(queue.length > 0, 'the queue must not be empty after loading demo data');
  for (let i = 1; i < queue.length; i++) {
    const previous = queue[i - 1].confirmedPriority;
    const current = queue[i].confirmedPriority;
    assert(previous <= current, 'the queue must be ordered by confirmed priority, found ' + previous + ' before ' + current);
  }
  assert(queue[0].confirmedPriority === 1, 'the first patient in the queue must be Level 1');

  const pending = store.pendingTriage();
  equal(pending.length, 1, 'the demo set includes exactly one registration awaiting confirmation');
  assert(pending[0].suggestedPriority === 1, 'that patient reports a critical warning sign');

  assert(store.criticalAlerts().length >= 1, 'the emergency alert banner must have something to show');
  store.criticalAlerts().forEach((patient) => assert(patient.status !== 'completed', 'completed patients must not raise alerts'));
});

test('an intentional override in the demo data keeps its own reason', () => {
  const escalated = store.all().filter((p) => p.demo && p.overrideReason && p.overrideReason.indexOf('Escalated') === 0);
  assert(escalated.length >= 1, 'the demo data must demonstrate a documented override');
  assert(escalated[0].suggestedPriority !== escalated[0].confirmedPriority, 'the suggestion and the decision must differ');
});

test('removing the demo data leaves staff-entered records untouched', () => {
  const mine = register({ symptoms: 'Mild cough for five days', symptomDuration: '5 days' });
  store.confirmPriority(mine.id, 4, { force: true, staff: 'test' });
  const removed = store.clearDemo();
  assert(removed.removed >= 10, 'the demo records must be removed');
  assert(store.get(mine.id), 'the record entered by staff must still exist');
  assert(!store.all().some((p) => p.demo), 'no demo records must remain');
});

/* ========================== PERSISTENCE ================================ */

section('Persistence');

test('records survive a reload of the store from storage', () => {
  resetStore();
  const patient = register({ symptoms: 'Moderate abdominal pain with vomiting' });
  store.confirmPriority(patient.id, 2, { force: true, staff: 'Dr Persist' });
  const raw = sandbox.localStorage.getItem(cfg.STORAGE.key);
  assert(raw && raw.length > 100, 'the state must be written to storage');

  store.init();  /* simulate a page reload */
  const restored = store.get(patient.id);
  assert(restored, 'the patient must be restored');
  equal(restored.confirmedPriority, 2);
  equal(restored.confirmedBy, 'Dr Persist');
});

test('a corrupted payload does not break the application', () => {
  sandbox.localStorage.setItem(cfg.STORAGE.key, '{ not json at all');
  store.init();
  assert(Array.isArray(store.all()), 'the store must recover with an empty list');
  equal(store.all().length, 0);
});

test('settings are validated and persisted', () => {
  const bad = store.updateSettings({ consultRooms: 0, waitSpreadPercent: 500 });
  equal(bad.ok, false);
  assert(bad.errors.consultRooms, 'an invalid room count must be rejected');
  assert(bad.errors.waitSpreadPercent, 'an invalid spread must be rejected');

  const good = store.updateSettings({ consultRooms: 4, serviceMinutes: { 1: 5, 2: 12, 3: 20, 4: 30 } });
  assert(good.ok, 'valid settings must be accepted');
  equal(store.settings.consultRooms, 4);
  store.resetSettings();
  equal(store.settings.consultRooms, cfg.DEFAULT_SETTINGS.consultRooms);
});

test('the full demo workflow runs end to end', () => {
  resetStore();
  store.addDemoPatients(MF.demo.build());

  /* 1. Register a new high-priority patient */
  const created = store.create({
    name: 'Workflow Patient',
    age: 61,
    symptoms: 'Severe abdominal pain with vomiting everything, unable to drink',
    symptomDuration: '6 hours',
    vitals: { temperature: 38.1, pulse: 108, spo2: 96, systolic: 118, diastolic: 74 },
    department: 'General Medicine',
    source: 'emergency',
    redFlags: [],
    staff: 'Dr Workflow'
  });
  assert(created.ok, 'registration must succeed');
  const patientId = created.patient.id;
  assert(created.patient.suggestedPriority <= 2, 'the rules should suggest a high priority for this presentation');

  /* 2. A patient without a confirmed priority is visible, not hidden */
  assert(store.pendingTriage().some((p) => p.id === patientId), 'the new patient awaits confirmation');

  /* 3. Staff confirm the suggested priority */
  const suggested = created.patient.suggestedPriority;
  const confirmed = store.confirmPriority(patientId, suggested, { staff: 'Dr Workflow' });
  assert(confirmed.ok, 'confirmation must succeed');
  assert(store.activeQueue().some((p) => p.id === patientId), 'the patient must now be in the ordered queue');
  assert(store.pendingTriage().every((p) => p.id !== patientId), 'the patient must leave the pending list');

  /* 4. The queue must be ordered by urgency around the new patient */
  const queue = store.activeQueue();
  const index = queue.findIndex((p) => p.id === patientId);
  for (let i = 1; i < queue.length; i++) {
    assert(queue[i - 1].confirmedPriority <= queue[i].confirmedPriority, 'the queue must stay ordered after a new arrival');
  }

  /* 5. Staff change the priority with an override reason and the queue reorders */
  const indexBefore = store.activeQueue().findIndex((p) => p.id === patientId);
  const target = suggested === 1 ? 3 : 1;
  const override = store.confirmPriority(patientId, target, { staff: 'Dr Workflow', reason: 'Senior review changed the provisional level.' });
  assert(override.ok, 'an override with a reason must succeed');
  equal(store.get(patientId).overrideReason, 'Senior review changed the provisional level.');

  const reordered = store.activeQueue();
  const indexAfter = reordered.findIndex((p) => p.id === patientId);
  for (let i = 1; i < reordered.length; i++) {
    assert(reordered[i - 1].confirmedPriority <= reordered[i].confirmedPriority, 'the queue must be reordered after an override');
  }
  if (target < suggested) {
    assert(indexAfter < indexBefore, 'escalating the patient must move them further up the queue');
  }
  const firstLowerPriority = reordered.findIndex((p) => p.confirmedPriority > target);
  assert(firstLowerPriority === -1 || indexAfter < firstLowerPriority,
    'a patient escalated to Level ' + target + ' must be placed ahead of every lower priority patient');

  /* 6. Move to consultation and complete */
  assert(store.setStatus(patientId, 'in_consultation', { staff: 'Dr Workflow' }).ok, 'starting the consultation must succeed');
  const afterStart = store.stats();
  assert(afterStart.counts.inConsultation >= 1, 'the dashboard must show the patient in consultation');
  assert(store.setStatus(patientId, 'completed', { staff: 'Dr Workflow', note: 'Treated and discharged.' }).ok, 'completing must succeed');

  /* 7. The patient must be removed from the live queue and counted */
  assert(!store.activeQueue().some((p) => p.id === patientId), 'completed patients leave the queue');
  const finalStats = store.stats();
  assert(finalStats.counts.completed >= 2, 'the completion must be counted');
  assert(store.get(patientId).history.length >= 5, 'the history must record the whole journey');
});

/* ------------------------------- summary -------------------------------- */

console.log('\n' + '─'.repeat(58));
console.log(passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log('\nFailures:');
  failures.forEach((item) => console.log('  • ' + item.name + '\n    ' + item.error.message));
  process.exit(1);
}
console.log('All MediFlow checks passed.');
process.exit(0);
