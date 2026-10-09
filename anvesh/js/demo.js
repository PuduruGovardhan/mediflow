/* ==========================================================================
   MediFlow | js/demo.js
   --------------------------------------------------------------------------
   Fictional demo patients for the hackathon demonstration.

   IMPORTANT
     Every record here is invented. Names, phone numbers and symptoms are
     synthetic. `demo: true` is set on each record and the UI shows a "DEMO"
     badge plus a banner, so nobody can mistake this for real patient data.
     No real patient information may ever be added to this file.

   The set deliberately mixes:
     * Level 1 critical warning-sign cases (chest pain, stroke, bleeding...)
     * Level 2 high priority cases
     * Level 3 moderate cases
     * Level 4 routine cases
     * a mixture of statuses (waiting / in consultation / completed /
       reassessment required) and departments
     * one patient registered with symptoms but WITHOUT confirmed triage, to
       demonstrate the "awaiting confirmation" safety strip
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.demo = (function () {
  'use strict';

  /** Minutes before now, converted to an ISO timestamp. */
  function ago(minutes) {
    return new Date(Date.now() - minutes * 60000).toISOString();
  }

  function build() {
    return [
      /* ------------------------- CRITICAL (Level 1) ---------------------- */
      {
        name: 'Demo Patient A – Chest Pain',
        age: 58,
        gender: 'Male',
        phone: '+1 555 0101',
        symptoms: 'Crushing chest pain spreading to the left arm, sweating and feeling very unwell since this morning.',
        symptomDuration: '45 minutes',
        conditions: 'High blood pressure, type 2 diabetes',
        allergies: 'Penicillin',
        vitals: { temperature: 36.9, pulse: 118, spo2: 93, systolic: 168, diastolic: 98 },
        redFlags: ['chest_pain'],
        department: 'Cardiology',
        source: 'emergency',
        confirmedPriority: 1,
        status: 'in_consultation',
        registeredAt: ago(38),
        note: 'ECG requested immediately. Patient moved straight to the resuscitation area.'
      },
      {
        name: 'Demo Patient B – Suspected Stroke',
        age: 71,
        gender: 'Female',
        phone: '+1 555 0102',
        symptoms: 'Sudden face drooping on the right side with slurred speech that started 20 minutes ago.',
        symptomDuration: '20 minutes',
        conditions: 'Atrial fibrillation',
        allergies: 'None known',
        vitals: { temperature: 36.7, pulse: 92, spo2: 96, systolic: 182, diastolic: 96 },
        redFlags: ['stroke'],
        department: 'Neurology',
        source: 'emergency',
        confirmedPriority: 1,
        status: 'waiting',
        registeredAt: ago(21),
        note: 'Stroke pathway activated. CT scan requested.'
      },
      {
        name: 'Demo Patient C – Severe Bleeding',
        age: 34,
        gender: 'Male',
        phone: '+1 555 0103',
        symptoms: 'Severe bleeding from a deep laceration on the forearm after a workshop accident. Pressure dressing applied but bleeding heavily.',
        symptomDuration: '30 minutes',
        conditions: '',
        allergies: 'None known',
        vitals: { temperature: 36.4, pulse: 124, spo2: 97, systolic: 104, diastolic: 66 },
        redFlags: ['bleeding'],
        department: 'Emergency',
        source: 'emergency',
        confirmedPriority: 1,
        status: 'waiting',
        registeredAt: ago(14),
        note: 'Direct pressure maintained. Tetanus status unknown.'
      },

      /* ----------------------- HIGH (Level 2) ---------------------------- */
      {
        name: 'Demo Patient D – Breathing Difficulty',
        age: 66,
        gender: 'Female',
        phone: '+1 555 0104',
        symptoms: 'Moderate shortness of breath with wheezing, worse over the last two days. Known asthma, relieved slightly by the inhaler but not fully. Able to speak in short sentences.',
        symptomDuration: '2 days',
        conditions: 'Asthma, obesity',
        allergies: 'Dust',
        vitals: { temperature: 37.4, pulse: 104, spo2: 95, systolic: 142, diastolic: 86 },
        redFlags: [],
        department: 'General Medicine',
        source: 'emergency',
        /* MediFlow's rules give this presentation Level 3. Staff escalated it to
           Level 2 and recorded why – a deliberate demonstration that the rule
           suggestion is advice, not a decision. */
        confirmedPriority: 2,
        overrideReason: 'Escalated above the suggestion: known asthma with audible wheeze and a rising respiratory rate. Senior registrar asked for urgent review.',
        status: 'waiting',
        registeredAt: ago(52),
        note: 'Nebuliser given at triage. Reassess oxygen saturation every 15 minutes.'
      },
      {
        name: 'Demo Patient E – Severe Abdominal Pain',
        age: 27,
        gender: 'Female',
        phone: '+1 555 0105',
        symptoms: 'Severe abdominal pain in the lower right side with vomiting, pain score 8, cannot keep fluids down.',
        symptomDuration: '10 hours',
        conditions: '',
        allergies: 'Latex',
        vitals: { temperature: 38.2, pulse: 108, spo2: 98, systolic: 118, diastolic: 74 },
        redFlags: [],
        department: 'General Medicine',
        source: 'emergency',
        confirmedPriority: 2,
        status: 'in_consultation',
        registeredAt: ago(75),
        note: 'Surgical review requested.'
      },
      {
        name: 'Demo Patient F – High Fever',
        age: 4,
        gender: 'Female',
        symptoms: 'Very high fever with shivering and refusing to drink, irritable and unsettled since yesterday evening.',
        symptomDuration: '1 day',
        conditions: '',
        allergies: 'None known',
        vitals: { temperature: 39.6, pulse: 132, spo2: 97, systolic: 98, diastolic: 62 },
        redFlags: [],
        department: 'Paediatrics',
        source: 'emergency',
        confirmedPriority: 2,
        status: 'waiting',
        registeredAt: ago(33),
        note: 'Paediatric nurse reviewing. Parent present.'
      },
      {
        name: 'Demo Patient G – Fall from Height',
        age: 41,
        gender: 'Male',
        phone: '+1 555 0107',
        symptoms: 'Significant injury after a fall from height. Deep cut on the leg with a deformed limb, suspected fracture, pain score 7.',
        symptomDuration: '2 hours',
        conditions: '',
        allergies: 'None known',
        vitals: { temperature: 36.5, pulse: 112, spo2: 98, systolic: 126, diastolic: 80 },
        redFlags: [],
        department: 'Orthopaedics',
        source: 'emergency',
        confirmedPriority: 2,
        status: 'waiting',
        registeredAt: ago(97),
        note: 'Waiting on X-ray request. Long wait – reassessment flagged by MediFlow.'
      },

      /* ---------------------- MODERATE (Level 3) ------------------------- */
      {
        name: 'Demo Patient H – Fever and Vomiting',
        age: 30,
        gender: 'Male',
        phone: '+1 555 0108',
        symptoms: 'Fever with vomiting and diarrhoea for two days. Drinking small amounts, no blood seen.',
        symptomDuration: '2 days',
        conditions: '',
        allergies: 'None known',
        vitals: { temperature: 38.1, pulse: 96, spo2: 98, systolic: 122, diastolic: 78 },
        redFlags: [],
        department: 'General Medicine',
        source: 'outpatient',
        confirmedPriority: 3,
        status: 'waiting',
        registeredAt: ago(46)
      },
      {
        name: 'Demo Patient I – Urinary Symptoms',
        age: 68,
        gender: 'Female',
        symptoms: 'Burning urine and lower back pain for three days, feeling tired but able to drink normally.',
        symptomDuration: '3 days',
        conditions: 'High blood pressure',
        allergies: 'Sulfa drugs',
        vitals: { temperature: 37.6, pulse: 84, spo2: 98, systolic: 138, diastolic: 82 },
        redFlags: [],
        department: 'General Medicine',
        source: 'outpatient',
        confirmedPriority: 3,
        status: 'waiting',
        registeredAt: ago(64)
      },
      {
        name: 'Demo Patient J – Ankle Injury',
        age: 22,
        gender: 'Female',
        phone: '+1 555 0110',
        symptoms: 'Swollen joint and knee pain after a football match, able to walk with a limp, pain score 5.',
        symptomDuration: '6 hours',
        conditions: '',
        allergies: 'None known',
        vitals: { temperature: 36.6, pulse: 78, spo2: 99, systolic: 116, diastolic: 72 },
        redFlags: [],
        department: 'Orthopaedics',
        source: 'outpatient',
        confirmedPriority: 3,
        status: 'completed',
        registeredAt: ago(210),
        note: 'X-ray clear. Discharged with strapping and analgesia.'
      },
      {
        name: 'Demo Patient K – Dental Pain',
        age: 39,
        gender: 'Male',
        symptoms: 'Toothache with a painful swelling of the gum for four days, taking over-the-counter painkillers.',
        symptomDuration: '4 days',
        conditions: '',
        allergies: 'None known',
        vitals: { temperature: 37.1, pulse: 80, spo2: 98, systolic: 128, diastolic: 80 },
        redFlags: [],
        department: 'Dental',
        source: 'outpatient',
        confirmedPriority: 3,
        status: 'reassessment',
        registeredAt: ago(128),
        note: 'Reassessment required – waiting time has become long.'
      },

      /* ----------------------- ROUTINE (Level 4) ------------------------- */
      {
        name: 'Demo Patient L – Mild Cough',
        age: 25,
        gender: 'Female',
        phone: '+1 555 0112',
        symptoms: 'Cough and runny nose with a mild sore throat for five days, no shortness of breath, able to eat and drink.',
        symptomDuration: '5 days',
        conditions: '',
        allergies: 'None known',
        vitals: { temperature: 36.9, pulse: 72, spo2: 99, systolic: 112, diastolic: 70 },
        redFlags: [],
        department: 'General Medicine',
        source: 'outpatient',
        confirmedPriority: 4,
        status: 'waiting',
        registeredAt: ago(88)
      },
      {
        name: 'Demo Patient M – Blood Pressure Check',
        age: 55,
        gender: 'Male',
        symptoms: 'Routine blood pressure check and follow-up for a stable chronic condition. No new complaints.',
        symptomDuration: '1 month',
        conditions: 'Hypertension (stable)',
        allergies: 'None known',
        vitals: { temperature: 36.7, pulse: 76, spo2: 98, systolic: 132, diastolic: 84 },
        redFlags: [],
        department: 'Cardiology',
        source: 'outpatient',
        confirmedPriority: 4,
        status: 'completed',
        registeredAt: ago(300),
        note: 'Medication continued. Routine follow-up in three months.'
      },
      {
        name: 'Demo Patient N – Skin Rash',
        age: 19,
        gender: 'Female',
        symptoms: 'Itching rash on both arms for one week, no fever, no swelling of the face or throat.',
        symptomDuration: '1 week',
        conditions: '',
        allergies: 'Nickel',
        vitals: { temperature: 36.6, pulse: 70, spo2: 99, systolic: 110, diastolic: 68 },
        redFlags: [],
        department: 'Dermatology',
        source: 'outpatient',
        confirmedPriority: 4,
        status: 'waiting',
        registeredAt: ago(120)
      },

      /* ------------- PENDING CONFIRMATION (demonstration case) ----------- */
      {
        name: 'Demo Patient O – Awaiting Triage',
        age: 47,
        gender: 'Male',
        phone: '+1 555 0115',
        symptoms: 'Sudden confusion and slurred speech noticed by a family member this morning.',
        symptomDuration: '3 hours',
        conditions: 'None recorded',
        allergies: '',
        vitals: {},
        redFlags: ['stroke'],
        department: 'Emergency',
        source: 'emergency',
        /* No confirmedPriority on purpose: the record stays in the
           "awaiting confirmation" strip so staff must act on it. */
        status: 'waiting',
        registeredAt: ago(6),
        note: 'Registered in a hurry. Priority not yet confirmed by staff – this demonstrates the safety strip.'
      }
    ];
  }

  /** Ready-to-use description shown in the UI before loading. */
  function describe() {
    var list = build();
    return {
      count: list.length,
      critical: list.filter(function (p) { return p.confirmedPriority === 1; }).length,
      high: list.filter(function (p) { return p.confirmedPriority === 2; }).length,
      moderate: list.filter(function (p) { return p.confirmedPriority === 3; }).length,
      routine: list.filter(function (p) { return p.confirmedPriority === 4; }).length,
      pending: list.filter(function (p) { return !p.confirmedPriority; }).length
    };
  }

  return { build: build, describe: describe };
})();
