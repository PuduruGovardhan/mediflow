# MediFlow – Smart Patient Queue & Emergency Triage

**Right Priority. Better Patient Flow.**

A complete, working hackathon prototype for the problem statement *Smart Patient Queue & Emergency Triage*. Hospital staff register patients, MediFlow applies **transparent rules** to suggest a provisional triage level **with its reasons**, staff confirm or override that suggestion, and the live queue re-orders itself by confirmed urgency and waiting time.

> **This is a prototype, not a medical device.** MediFlow does not diagnose disease, does not replace a trained clinician, and must not be used with real patient information. Every suggestion can be overridden by staff, and every override is stored with a reason.

---

## 1. Run it (2 minutes)

Nothing to install. No build step. No dependencies.

**Option A — double-click**

Open `index.html` in Chrome, Edge or Firefox.

**Option B — serve it over http (recommended)**

```bash
node server.js            # then open http://localhost:4173/
node server.js 8080       # or pick your own port
# or
npm start
```

Serving over `http://` is more reliable than `file://` (some browsers restrict browser storage on `file://`), and it also lets you demo MediFlow on a phone or tablet on the same Wi-Fi by opening `http://<your-lan-ip>:4173/`.

**First thing to do:** click **Load demo patients** on the dashboard. That loads 15 fictional patients covering all four triage levels so every screen has data immediately.

Requirements: any modern browser. Python is **not** required — if you prefer Flask/SQLite, see §9.

---

## 2. Hackathon demo script (7 minutes)

| # | Do this | What the audience sees |
|---|---|---|
| 1 | Open `#/dashboard` | Six live statistics: total, waiting, urgent, in consultation, completed, measured average wait |
| 2 | Click **Load demo patients** → confirm | 15 fictional patients appear, all badged `DEMO`; the emergency alert banner shows the Level 1 patients |
| 3 | Go to **Register Patient**, type the symptoms (e.g. *"crushing chest pain spreading to the left arm"*) | The provisional level and **every reason** update live in the right-hand panel; the emergency alert appears as soon as a warning sign is detected |
| 4 | Click **Review assessment & register** | A confirmation dialog shows the suggestion, the reasons and a pre-selected level; change the level and it demands a written reason |
| 5 | Confirm | The patient is created, gets an auto ID (`MF-1016`), and the app jumps to the full record |
| 6 | On the record, click **Change priority** → pick a different level, leave the reason blank, confirm | MediFlow refuses and explains why a reason is required |
| 7 | Add a reason → confirm | The queue re-orders instantly; the record shows "Priority was overridden by staff" with the reason, and the original suggestion is still visible |
| 8 | Click **Mark as In Consultation**, then **Mark as Completed** | Status history and timestamps update; the patient leaves the live queue and appears in the analytics |
| 9 | Go to **Live Queue**: search by ID, filter by Level 1, sort by longest wait | Queue narrows/expands instantly; the amber "awaiting triage confirmation" strip never disappears so nobody is lost |
| 10 | Go to **Analytics** | Four charts plus KPIs; demo statistics are labelled as simulated |
| 11 | Go to **Settings & Demo** → **Reset / remove demo data** | Only the fictional records are deleted; anything you registered yourself stays |

---

## 3. Project structure

```
.
├── index.html               Application shell: sidebar, topbar, SVG icon sprite, script order
├── css/
│   └── styles.css           One stylesheet: design tokens, layout, components, responsive rules
├── js/
│   ├── config.js            ★ All clinical/tunable constants: levels, statuses, warning signs,
│   │                          symptom rules, vital ranges, departments, disclaimers
│   ├── utils.js             DOM helpers, escaping, dates/durations, validation primitives
│   ├── storage.js           localStorage persistence with an in-memory fallback
│   ├── triage.js            ★ The rule-based triage engine (suggestion + reasons + safety rules)
│   ├── waiting.js           ★ Transparent illustrative waiting-time model
│   ├── store.js             ★ State, CRUD, queue ordering, confirm/override, status flow, history, stats
│   ├── demo.js              The 15 fictional demo patients
│   ├── charts.js            Chart.js helpers + a dependency-free CSS chart fallback
│   ├── ui.js                Toasts, dialogs/confirmations, badges, empty states
│   ├── router.js            Hash router (dashboard / register / queue / patient / triage / analytics / settings)
│   ├── app.js               Bootstrap, global chrome, emergency banner, demo banner
│   └── views/
│       ├── shared.js        Shared fragments + the single implementation of every patient action
│       ├── dashboard.js     Live dashboard
│       ├── register.js      Registration form + live triage preview + confirmation step
│       ├── queue.js         Live queue with priority bands, search, filters, sorting
│       ├── patient.js       Full record, staff controls, notes, history
│       ├── triage.js        Triage worklist (awaiting confirmation + recent decisions)
│       ├── analytics.js     Analytics and charts
│       └── settings.js      Configurable warning signs, waiting model, data management
├── server.js                Zero-dependency static server (optional)
├── tests/
│   ├── run-tests.js         Logic tests (60) — triage rules, queue order, status flow, persistence
│   └── browser-check.js     End-to-end UI test (146 checks) driving headless Chrome
├── docs/
│   └── PRESENTER-GUIDE.md   Module-by-module explanation for a beginner presenting this
└── package.json             Only defines `npm start` and `npm test`
```

★ = the files worth reading to understand the application logic.

---

## 4. Application design

- **Layout:** fixed sidebar → sticky topbar → page content, with a global emergency-alert banner and demo-data banner under the top bar.
- **Colours:** white surfaces on a soft blue-grey canvas; blue/teal brand accents; red reserved for critical alerts and destructive actions.
- **Priority colours** are used consistently everywhere (badges, table edges, queue bands, charts): Level 1 deep red, Level 2 burnt orange, Level 3 dark yellow, Level 4 teal. Every level is also labelled with text ("L1 Critical"), so colour is never the only signal.
- **Responsive:** three-column desktop layouts collapse to a single column, the sidebar becomes a swipe-free drawer below 960px, tables scroll horizontally inside their own container, and dialogs become full-width on phones. Verified with no horizontal overflow at 390, 820 and 1440 px.
- **Accessibility:** semantic landmarks, `aria-live` toasts, `aria-current` on the active nav item, radio-card priority pickers, keyboard `Escape` closes dialogs, `:focus-visible` outlines, disabled buttons carry `aria-disabled` **and** a tooltip explaining why the action is unavailable.
- **No dead ends:** empty states explain what to do next; every button either acts or is visibly disabled with a reason.

---

## 5. How the triage assistance works

All rules live in `js/config.js` and can be edited in the UI (**Settings → Critical warning signs**).

### The four provisional levels

| Level | Name | Meaning |
|---|---|---|
| 1 | Critical | Potentially life-threatening warning signs requiring immediate emergency assessment |
| 2 | High Priority | Serious symptoms requiring rapid professional assessment |
| 3 | Moderate | Symptoms requiring timely assessment |
| 4 | Routine | Apparently stable complaints suitable for the routine queue |

### Deliberate safety rules

1. **Warning signs escalate immediately.** 13 configurable warning signs (severe difficulty breathing, unconsciousness, suspected stroke, severe uncontrolled bleeding, chest pain, seizure, anaphylaxis, shock, poisoning, pregnancy emergency, severe head injury, airway obstruction, acute mental-health crisis). A sign produces **Level 1** and a prominent emergency alert telling staff to seek immediate clinical assessment — *ticking the box is not required*, the same keywords are detected in the free-text symptom description.
2. **Age is never used on its own.** It only adds a single "caution" point when another signal is already present, and it can never create a Level 1.
3. **A single soft symptom can never reach Level 2.** Level 2 requires a combined score of ≥ 6, so at least two meaningful signals, or one plus a critically abnormal vital sign.
4. **Missing information never produces an unjustified low priority.** No vitals recorded → the suggested level is capped at Level 3, staff review is requested, and the reason is displayed. Vitals outside the safe range are never classified as Routine.
5. **Nothing is a black box.** Every rule that fires is listed under *"Why MediFlow suggested this level"* with its point contribution.
6. **Staff decide.** The suggested level, the staff-confirmed level and the override reason are stored in **three separate fields**. Overriding a suggestion always requires a written reason.
7. **Honest wording.** The engine states that it does not diagnose and does not replace a clinician — in the UI, in the config file and in this README.

### Scored signals for Levels 2–4

Symptom keywords (weighted), vital-sign rules (pulse, temperature, oxygen saturation, blood pressure), symptom duration (recent/sudden onset adds weight; a long-standing pattern is noted but carefully), and the arrival source (emergency adds a small weight). Thresholds: `≥ 6 → Level 2`, `≥ 2 → Level 3`, otherwise `Level 4`.

---

## 6. How the queue and the waiting estimate work

**Ordering (as specified):** staff-confirmed urgency first (Level 1 → 4), then time of registration (oldest first) inside each level.

**Patients awaiting confirmation** are held in a separate, prominent amber strip on the dashboard, on the queue page and on the triage page. They are deliberately *not* mixed into the ordered queue, so a suggestion can never be mistaken for a decision — and they can never be forgotten either.

**Long waits** exceeding a configurable threshold (default 60 minutes) are surfaced on the dashboard and in the queue with a one-click **Reassess** action.

**Waiting estimate** (`js/waiting.js`) is intentionally simple and fully transparent:

```
work = Σ (illustrative service minutes of the patients ahead)
     + Σ (half the service minutes of consultations already running)
estimate = work ÷ consultation rooms  +  half of this patient's own service time
range    = estimate ± 40%  (configurable), rounded to 5 minutes
```

It is always displayed as "*about 20–40 min*" with the words **estimate**, never as a guarantee, together with the explanation that emergencies, staffing levels and treatment complexity change real waiting times. The analytics page separately reports **measured** waiting time (real timestamps: registration → first clinical contact) so the two are never confused.

---

## 7. Data management and reliability

- **Storage:** the whole application state is one JSON document in `localStorage` (`mediflow.state.v1`), written after every change. If browser storage is unavailable (private mode, restricted `file://`), MediFlow degrades to an in-memory store and tells the user clearly instead of failing silently.
- **Duplicate IDs:** patient IDs come from a persisted counter and are checked against existing records, so `MF-1001` can never be issued twice.
- **Validation** happens twice: in the form (with inline messages) and again in `store.js` before anything is written. Age, name, symptoms, vital ranges and physically impossible blood pressure readings are all rejected with specific messages.
- **Referential consistency:** the dashboard, queue, triage page and analytics all read the same store, and a single subscription re-renders the current page after every mutation, so figures can never drift apart.
- **Corrupted data:** if the stored payload cannot be parsed, MediFlow keeps a copy for debugging and starts clean rather than crashing.
- **Recovery:** export/import a JSON backup from **Settings → Data management**; reset the demo data without touching your own records; or wipe everything (behind a typed `DELETE` confirmation).
- **Privacy:** only the fields needed for the workflow are collected. Gender, phone, history, allergies and vitals are explicitly optional and marked as such. Emergency registration needs only a name and an age, and the UI says so.

---

## 8. Testing

```bash
npm test                      # 60 logic tests (needs Node only)
node server.js 4173 &         # 146 end-to-end UI checks (needs Chrome/Edge)
node tests/browser-check.js
```

- `tests/run-tests.js` loads the real modules into a sandbox with a fake `window`/`localStorage` and asserts the triage rules (including all six safety rules above), ID generation, override-reason enforcement, queue ordering, status-flow rules, measured waiting time, analytics figures, demo data and persistence across a simulated reload. It also syntax-checks every shipped script.
- `tests/browser-check.js` drives the **real interface** in headless Chrome over the DevTools Protocol (no dependencies — Node's built-in `WebSocket`), clicking the actual buttons and accepting the actual dialogs: loads demo data, filters the queue, registers a patient with live triage, confirms and overrides a priority, moves a patient through consultation to completed, records notes, reassigns a department, flags reassessment, cancels a registration, opens every page, and checks the layout for horizontal overflow at phone/tablet/laptop widths. It fails on any uncaught exception or `console.error`.

Current status: **60/60 logic tests and 146/146 browser checks pass.**

---

## 9. Architecture notes and design decisions

- **No framework, no build step.** Plain HTML, CSS and vanilla JavaScript with one global namespace (`MediFlow`) and plain `<script>` tags in dependency order. This keeps the code readable during a presentation and removes every setup failure mode.
- **One direction of data flow.** `store.js` is the only module that changes patient records. Every mutation appends a history entry, persists, then notifies subscribers; `app.js` re-renders the chrome and the current view. Views never mutate records directly.
- **One implementation per action.** Every patient button (`Open`, `Start`, `Complete`, `Reassess`, `Confirm priority`, `Note`, `Department`, `Cancel`) is handled once in `js/views/shared.js`, so a control cannot behave differently on two pages.
- **Fresh DOM per render.** The router replaces the page element on each render instead of reusing it, so delegated listeners can never stack up and fire twice.
- **Charts never block.** Chart.js is loaded asynchronously from a CDN; if the venue Wi-Fi is down, `charts.js` draws the identical data as CSS bars. The app is fully usable offline — the only network request is the optional chart library.
- **Icons are inline SVG** in a sprite inside `index.html`: no icon font, no CDN, no missing-glyph boxes.

### If you want a Flask + SQLite backend instead

The brief allows either. This build chose the localStorage prototype because it runs anywhere with zero setup. To add a backend, keep the view layer and replace `js/store.js` with `fetch()` calls against these endpoints — the rest of the application does not need to change:

```
GET    /api/patients                 list
POST   /api/patients                 create (validate server-side, parameterised SQL)
GET    /api/patients/<id>            detail + history
PATCH  /api/patients/<id>            status / department / notes
POST   /api/patients/<id>/priority   { confirmedPriority, reason, staff }
DELETE /api/patients/<id>/demo       remove demo records
```

Note that a real deployment needs far more than an API: authentication, role-based access, an audit trail, encryption at rest, and a proper clinical validation of any triage logic.

---

## 10. Known limitations

- **Triage logic is a demonstration of rule-based reasoning**, not a validated clinical triage scale. A production system would use a validated tool (e.g. a national early warning score) under clinical governance.
- **No authentication or roles.** The "signed-in staff" identity is a demo setting, so nobody is prevented from confirming a priority.
- **Single-browser data.** Records live in one browser profile; they are not shared between devices or users, and clearing browser data deletes them. The audit trail is per-patient history only.
- **Waiting estimates use configurable averages**, not a queueing simulation or live staffing data.
- **Analytics are operational counts**, not clinical outcome measures, and any figure influenced by demo records is labelled simulated.
- **English only**, and the wording avoids claiming any regulatory status (no CE/FDA/MDR claims).

---

## 11. Future improvements

1. **Backend + real database** (Flask/FastAPI + PostgreSQL) with authentication, roles (registration clerk, nurse, clinician, admin), and an append-only audit log.
2. **Validated triage scoring** (e.g. NEWS2/ESI) reviewed by clinicians, with versioned rule sets and a documented change process.
3. **Reassessment timers and reminders** — automatic escalation when a waiting patient crosses a safety threshold, plus shift-handover summaries.
4. **Live bed/room and staff roster integration** so waiting estimates reflect real capacity.
5. **Real-time multi-user sync** (WebSockets) with conflict handling across devices, plus printing/wristband integration for patient IDs.
6. **Analytics depth:** service-level trends, per-department waiting distributions, and left-without-being-seen tracking.
7. **Accessibility and localisation:** full screen-reader audit, WCAG 2.2 AA verification, and multilingual symptom keyword sets.
8. **Offline-first PWA** with a service worker so the tool keeps working through network outages.
9. **FHIR interoperability** for integration with a hospital information system.

---

## 12. Files you should not ship as-is

`js/demo.js` contains invented patients only, and `js/config.js` holds the warning-sign keyword lists. Both are safe for a demo, but review the keyword lists against your own clinical guidance before any real-world use, and never put real patient information into this application.
