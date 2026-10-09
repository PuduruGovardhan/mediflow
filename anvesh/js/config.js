/* ==========================================================================
   MediFlow | js/config.js
   --------------------------------------------------------------------------
   Central configuration. EVERYTHING clinical or tunable lives here so the
   rest of the code stays generic and a presenter can explain one file.

   Sections
   1. App identity & storage keys
   2. Priority levels (triage scale)
   3. Patient statuses
   4. Departments & registration sources
   5. Critical warning signs ("red flags") – configurable list
   6. Symptom keyword rules (scored)
   7. Vital-sign rules & validation ranges
   8. Default operational settings
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.config = (function () {
  'use strict';

  /* ------------------------- 1. APP IDENTITY ----------------------------- */

  var APP = {
    name: 'MediFlow',
    fullName: 'MediFlow – Smart Patient Queue & Emergency Triage',
    tagline: 'Right Priority. Better Patient Flow.',
    version: '1.0.0',
    build: 'hackathon-prototype',
    idPrefix: 'MF-',
    idStart: 1001
  };

  var STORAGE = {
    key: 'mediflow.state.v1',
    schemaVersion: 1
  };

  /* ----------------------- 2. PRIORITY LEVELS ---------------------------- */
  /* The four provisional triage levels used across the whole app.
     `serviceMinutes` is the *illustrative* average consultation length used
     only for waiting-time estimates. It is never a clinical prediction.     */

  var PRIORITY_LEVELS = {
    1: {
      level: 1,
      code: 'critical',
      label: 'Level 1',
      name: 'Critical',
      short: 'Critical',
      description: 'Potentially life-threatening warning signs requiring immediate emergency assessment.',
      action: 'Escalate immediately. Do not delay emergency care to finish registration.',
      serviceMinutes: 10,
      order: 1
    },
    2: {
      level: 2,
      code: 'high',
      label: 'Level 2',
      name: 'High Priority',
      short: 'High',
      description: 'Serious symptoms requiring rapid professional assessment.',
      action: 'Assess rapidly. Re-check at short intervals.',
      serviceMinutes: 15,
      order: 2
    },
    3: {
      level: 3,
      code: 'moderate',
      label: 'Level 3',
      name: 'Moderate',
      short: 'Moderate',
      description: 'Symptoms requiring timely assessment.',
      action: 'Timely assessment. Reassess if the patient reports worsening.',
      serviceMinutes: 25,
      order: 3
    },
    4: {
      level: 4,
      code: 'routine',
      label: 'Level 4',
      name: 'Routine',
      short: 'Routine',
      description: 'Apparently stable complaints suitable for the routine queue.',
      action: 'Routine queue. Monitor total waiting time and reassess if it grows long.',
      serviceMinutes: 35,
      order: 4
    }
  };

  /* ------------------------ 3. PATIENT STATUS ---------------------------- */

  var STATUSES = {
    waiting: {
      key: 'waiting',
      label: 'Waiting',
      tone: 'blue',
      icon: 'i-clock',
      description: 'Registered and waiting in the queue.'
    },
    in_consultation: {
      key: 'in_consultation',
      label: 'In Consultation',
      tone: 'teal',
      icon: 'i-stethoscope',
      description: 'Currently being seen by clinical staff.'
    },
    reassessment: {
      key: 'reassessment',
      label: 'Reassessment Required',
      tone: 'amber',
      icon: 'i-refresh',
      description: 'Condition or waiting time means the patient must be re-checked.'
    },
    completed: {
      key: 'completed',
      label: 'Completed',
      tone: 'green',
      icon: 'i-check-circle',
      description: 'Consultation finished and the patient has left the queue.'
    },
    cancelled: {
      key: 'cancelled',
      label: 'Cancelled',
      tone: 'slate',
      icon: 'i-ban',
      description: 'Duplicate or erroneous registration, removed from the flow.'
    }
  };

  /* Statuses considered "active" in the live queue. */
  var ACTIVE_STATUSES = ['waiting', 'reassessment', 'in_consultation'];

  /* ------------------- 4. DEPARTMENTS & SOURCES -------------------------- */

  var DEPARTMENTS = [
    'Emergency',
    'General Medicine',
    'Cardiology',
    'Paediatrics',
    'Orthopaedics',
    'Neurology',
    'Obstetrics & Gynaecology',
    'ENT',
    'Ophthalmology',
    'Dermatology',
    'Psychiatry',
    'Dental'
  ];

  var SOURCES = {
    emergency: {
      key: 'emergency',
      label: 'Emergency Department',
      short: 'Emergency',
      description: 'Walk-in or ambulance arrival at the emergency department.',
      icon: 'i-alert'
    },
    outpatient: {
      key: 'outpatient',
      label: 'Regular Outpatient',
      short: 'Outpatient',
      description: 'Routine appointment or outpatient clinic visit.',
      icon: 'i-calendar'
    }
  };

  /* ---------------------- 5. CRITICAL WARNING SIGNS ---------------------- */
  /* Configurable red flags. Each one is independently serious enough that a
     patient showing it should be escalated for immediate clinical review,
     so any single checked flag produces a Level 1 suggestion.
     Staff can edit this list in Settings.                                   */

  var RED_FLAGS = [
    { id: 'breathing', label: 'Severe difficulty breathing', keywords: ['severe difficulty breathing', 'cannot breathe', "can't breathe", 'gasping', 'severe shortness of breath', 'choking'] },
    { id: 'unconscious', label: 'Unconscious or unresponsive', keywords: ['unconscious', 'unresponsive', 'not waking', 'no response', 'collapsed and not responding'] },
    { id: 'stroke', label: 'Suspected stroke', keywords: ['suspected stroke', 'stroke', 'face drooping', 'slurred speech', 'sudden weakness one side', 'arm weakness'] },
    { id: 'bleeding', label: 'Severe uncontrolled bleeding', keywords: ['severe bleeding', 'uncontrolled bleeding', 'bleeding heavily', 'bleeding that will not stop', 'haemorrhage', 'hemorrhage'] },
    { id: 'chest_pain', label: 'Chest pain', keywords: ['chest pain', 'crushing chest', 'chest tightness', 'pressure in chest'] },
    { id: 'seizure', label: 'Active seizure', keywords: ['seizure', 'convulsion', 'fitting', 'seizing'] },
    { id: 'anaphylaxis', label: 'Severe allergic reaction / anaphylaxis', keywords: ['anaphylaxis', 'severe allergic reaction', 'throat swelling', 'swollen tongue'] },
    { id: 'shock', label: 'Signs of shock', keywords: ['signs of shock', 'clammy and pale', 'cold and clammy', 'fainting repeatedly'] },
    { id: 'poisoning', label: 'Suspected poisoning or overdose', keywords: ['overdose', 'poisoning', 'swallowed poison', 'took too many tablets'] },
    { id: 'obstetric', label: 'Pregnancy emergency', keywords: ['heavy bleeding in pregnancy', 'pregnancy emergency', 'no fetal movement', 'labour pains early'] },
    { id: 'head_injury', label: 'Severe head injury / reduced consciousness', keywords: ['severe head injury', 'head trauma with confusion', 'reduced consciousness', 'confused after fall'] },
    { id: 'airway', label: 'Airway obstruction', keywords: ['airway obstruction', 'swallowed object', 'object stuck in throat'] },
    { id: 'self_harm', label: 'Acute mental-health crisis or self-harm risk', keywords: ['suicidal', 'suicide', 'self harm', 'self-harm', 'wants to die', 'end my life'] }
  ];

  /* -------------------- 6. SYMPTOM KEYWORD RULES ------------------------- */
  /* Scored signals used for Levels 2–4. `points` accumulate; thresholds are
     applied afterwards. These are assistive heuristics only – staff always
     confirm or override the suggestion.

     `onlyWith` marks rules that must NEVER be used alone: they only add
     points when at least one other signal is also present.                   */

  var SYMPTOM_RULES = [
    /* --- Strong (Level 2 leaning) --- */
    { id: 'breath_moderate', label: 'Moderate shortness of breath', points: 3, level: 'high', keywords: ['shortness of breath', 'breathless', 'difficulty breathing', 'wheezing', 'cannot exercise'] },
    { id: 'abdo_severe', label: 'Severe abdominal pain', points: 3, level: 'high', keywords: ['severe abdominal pain', 'severe stomach pain', 'severe belly pain', 'acute abdomen'] },
    { id: 'bleeding_moderate', label: 'Moderate bleeding', points: 3, level: 'high', keywords: ['bleeding', 'blood loss', 'blood in stool', 'vomiting blood', 'blood in vomit'] },
    { id: 'high_fever', label: 'Very high fever with feeling unwell', points: 3, level: 'high', keywords: ['very high fever', 'high grade fever', 'fever with shivering', 'fever and confusion'] },
    { id: 'neuro', label: 'New neurological symptoms', points: 3, level: 'high', keywords: ['numbness', 'weakness in legs', 'sudden confusion', 'vision loss', 'double vision', 'severe headache with stiffness'] },
    { id: 'dehydration', label: 'Severe dehydration / unable to keep fluids down', points: 3, level: 'high', keywords: ['unable to drink', 'vomiting everything', 'severe dehydration', 'no urine output'] },
    { id: 'trauma', label: 'Significant injury / possible fracture', points: 3, level: 'high', keywords: ['deep cut', 'open wound', 'deformed limb', 'suspected fracture', 'broken bone', 'fall from height'] },
    { id: 'obstetric_moderate', label: 'Pregnancy-related concern', points: 3, level: 'high', keywords: ['pregnant and pain', 'spotting in pregnancy', 'reduced fetal movement'] },
    { id: 'palpitations', label: 'Palpitations with dizziness', points: 2, level: 'high', keywords: ['palpitations', 'racing heart', 'fast heartbeat with dizziness'] },
    { id: 'allergic_moderate', label: 'Moderate allergic reaction', points: 2, level: 'high', keywords: ['rash with swelling', 'hives', 'allergic reaction'] },

    /* --- Moderate (Level 3 leaning) --- */
    { id: 'fever', label: 'Fever', points: 2, level: 'moderate', keywords: ['fever', 'high temperature', 'hot to touch', 'temperature'] },
    { id: 'vomiting', label: 'Vomiting or diarrhoea', points: 2, level: 'moderate', keywords: ['vomiting', 'diarrhoea', 'diarrhea', 'nausea', 'throwing up'] },
    { id: 'moderate_pain', label: 'Moderate pain', points: 2, level: 'moderate', keywords: ['moderate pain', 'pain score 6', 'pain score 7', 'persistent pain', 'painful'] },
    { id: 'utichest', label: 'Chest symptoms without red flags', points: 2, level: 'moderate', keywords: ['chest discomfort', 'chest soreness'] },
    { id: 'urinary', label: 'Urinary symptoms', points: 1, level: 'moderate', keywords: ['burning urine', 'urinary tract', 'uti', 'peeing blood', 'urine infection'] },
    { id: 'back_pain', label: 'Back pain', points: 1, level: 'moderate', keywords: ['back pain', 'lower back', 'sciatica'] },
    { id: 'joint', label: 'Joint or limb pain', points: 1, level: 'moderate', keywords: ['joint pain', 'knee pain', 'swollen joint', 'sprained ankle', 'muscle pain'] },
    { id: 'mood', label: 'Acute mental-health distress', points: 3, level: 'high', keywords: ['panic attack', 'severe anxiety', 'psychosis', 'hallucinations', 'severe agitation'] },
    { id: 'dental', label: 'Dental pain', points: 1, level: 'moderate', keywords: ['toothache', 'dental pain', 'abscess tooth'] },

    /* --- Minor / chronic (Level 4 leaning) --- */
    { id: 'cough', label: 'Mild cough or cold', points: 1, level: 'low', keywords: ['cough', 'common cold', 'runny nose', 'sore throat', 'blocked nose', 'sneezing'] },
    { id: 'skin', label: 'Skin complaint', points: 1, level: 'low', keywords: ['rash', 'itching', 'eczema', 'acne', 'skin lesion', 'mole'] },
    { id: 'follow_up', label: 'Follow-up or medication review', points: 0, level: 'low', keywords: ['follow up', 'follow-up', 'prescription refill', 'medication review', 'dressing change', 'wound check', 'test results'] },
    { id: 'chronic_stable', label: 'Stable chronic condition review', points: 0, level: 'low', keywords: ['blood pressure check', 'diabetes review', 'stable angina review', 'routine checkup', 'routine check-up'] }
  ];

  /* -------------------- 7. VITAL-SIGN RULES & RANGES --------------------- */
  /* Hard validation ranges: values outside these are rejected by the form.
     Plausibility ranges used by the triage engine are in VITAL_RULES.        */

  var VITALS = {
    temperature: { key: 'temperature', label: 'Temperature', unit: '°C', icon: 'i-thermometer', min: 30, max: 45, step: 0.1, criticalLow: 35, criticalHigh: 40, warnLow: 35.5, warnHigh: 38.5 },
    pulse: { key: 'pulse', label: 'Pulse', unit: 'bpm', icon: 'i-pulse', min: 20, max: 250, step: 1, criticalLow: 40, criticalHigh: 130, warnLow: 50, warnHigh: 110 },
    spo2: { key: 'spo2', label: 'Oxygen saturation', unit: '%', icon: 'i-droplet', min: 50, max: 100, step: 1, criticalLow: 90, criticalHigh: 101, warnLow: 94, warnHigh: 101 },
    systolic: { key: 'systolic', label: 'Systolic BP', unit: 'mmHg', icon: 'i-heart', min: 50, max: 300, step: 1, criticalLow: 90, criticalHigh: 180, warnLow: 100, warnHigh: 160 },
    diastolic: { key: 'diastolic', label: 'Diastolic BP', unit: 'mmHg', icon: 'i-heart', min: 30, max: 200, step: 1, criticalLow: 55, criticalHigh: 110, warnLow: 60, warnHigh: 100 }
  };

  var VITAL_RULES = [
    { id: 'spo2_critical', vital: 'spo2', test: 'lt', value: 90, points: 6, severity: 'critical', label: 'Oxygen saturation below 90%' },
    { id: 'spo2_low', vital: 'spo2', test: 'lte', value: 94, points: 2, severity: 'vital', label: 'Oxygen saturation 90–94%' },
    { id: 'pulse_critical', vital: 'pulse', test: 'critical', points: 4, severity: 'critical', label: 'Pulse outside a safe range' },
    { id: 'pulse_abnormal', vital: 'pulse', test: 'warn', points: 2, severity: 'vital', label: 'Abnormal pulse rate' },
    { id: 'temp_critical', vital: 'temperature', test: 'critical', points: 3, severity: 'vital', label: 'Temperature far outside the normal range' },
    { id: 'temp_abnormal', vital: 'temperature', test: 'warn', points: 1, severity: 'vital', label: 'Abnormal temperature' },
    { id: 'bp_systolic_critical', vital: 'systolic', test: 'critical', points: 5, severity: 'critical', label: 'Systolic blood pressure critically abnormal' },
    { id: 'bp_systolic_abnormal', vital: 'systolic', test: 'warn', points: 2, severity: 'vital', label: 'Abnormal systolic blood pressure' },
    { id: 'bp_diastolic_abnormal', vital: 'diastolic', test: 'warn', points: 1, severity: 'vital', label: 'Abnormal diastolic blood pressure' }
  ];

  /* Score thresholds -> suggested level (for the non-red-flag path). */
  var SCORE_THRESHOLDS = [
    { min: 6, level: 2 },
    { min: 2, level: 3 },
    { min: 0, level: 4 }
  ];

  /* ------------------- 8. DEFAULT OPERATIONAL SETTINGS -------------------- */
  /* Stored in localStorage and editable from the Settings page. */

  var DEFAULT_SETTINGS = {
    consultRooms: 2,
    waitEnabled: true,
    waitSpreadPercent: 40,
    waitRoundMinutes: 5,
    longWaitThresholdMinutes: 60,
    serviceMinutes: { 1: 10, 2: 15, 3: 25, 4: 35 },
    redFlags: RED_FLAGS.map(function (f) { return { id: f.id, label: f.label, keywords: f.keywords.slice() }; }),
    symptomRules: SYMPTOM_RULES.map(function (r) {
      return { id: r.id, label: r.label, points: r.points, level: r.level, keywords: r.keywords.slice() };
    }),
    staffName: 'Dr. Demo',
    staffRole: 'Charge Nurse',
    staffInitials: 'DS'
  };

  /* --------------------------- DISCLAIMERS -------------------------------- */
  /* Reused in the UI so wording stays consistent and honest. */

  var DISCLAIMERS = {
    triage: 'Provisional triage assistance only. MediFlow applies transparent rules to the information you enter. It does not diagnose disease and does not replace a trained clinician. Authorised staff must confirm or override every suggestion.',
    wait: 'Illustrative estimate only – not a clinical prediction or a guarantee of when care will begin. Emergencies, staffing levels and treatment complexity change actual waiting times at any moment.',
    demo: 'All demo records are fictional and generated for demonstration. No real patient information is stored in this application.',
    prototype: 'Hackathon prototype. Not a medical device and not for clinical use.'
  };

  /* Indexes for fast lookup */
  var RED_FLAG_BY_ID = {};
  RED_FLAGS.forEach(function (f) { RED_FLAG_BY_ID[f.id] = f; });

  return {
    APP: APP,
    STORAGE: STORAGE,
    PRIORITY_LEVELS: PRIORITY_LEVELS,
    STATUSES: STATUSES,
    ACTIVE_STATUSES: ACTIVE_STATUSES,
    DEPARTMENTS: DEPARTMENTS,
    SOURCES: SOURCES,
    RED_FLAGS: RED_FLAGS,
    RED_FLAG_BY_ID: RED_FLAG_BY_ID,
    SYMPTOM_RULES: SYMPTOM_RULES,
    VITALS: VITALS,
    VITAL_RULES: VITAL_RULES,
    SCORE_THRESHOLDS: SCORE_THRESHOLDS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DISCLAIMERS: DISCLAIMERS
  };
})();
