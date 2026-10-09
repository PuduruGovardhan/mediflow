# MediFlow — Presenter's Guide

A plain-language walkthrough of every module, written for someone presenting MediFlow at a hackathon who did not necessarily write the code.

Two ground rules for the presentation:

1. **Never claim MediFlow diagnoses anything.** Say *"it suggests a provisional level using rules you can see, and a clinician confirms or overrides it."* That is both true and a stronger story.
2. **Say "estimate" for waiting times.** Never "this patient will be seen in 20 minutes."

---

## 1. The one-sentence pitch

> "MediFlow registers a patient in about thirty seconds, immediately shows which warning signs were detected and why, and then puts that patient in the right place in the queue — while every decision a human makes is recorded separately from what the machine suggested."

---

## 2. The 30-second architecture story

MediFlow is a single web page. There is no server, no build step and nothing to install: it is HTML, CSS and plain JavaScript, and everything is saved in the browser's own storage.

```
   User clicks  ─────────►  A VIEW renders the screen
                                  │
                                  ▼
                            UI KIT shows dialogs, toasts
                                  │
                                  ▼
                         STORE changes the record  ◄── the only writer
                                  │
                       (history + save + notify)
                                  ▼
                         Every open page re-renders itself
```

The important sentence: **"One module is allowed to change patient records — the store. That is why the dashboard, the queue and the analytics can never disagree with each other."**

---

## 3. Module by module

### `js/config.js` — the rulebook
Every clinical or tunable number lives here: the four priority levels, the patient statuses, the department list, the 13 warning signs, the symptom keyword list, the vital-sign ranges, the average service times and every disclaimer.

*Say:* "All the clinical knowledge is in one file, so a clinician can review it without touching the rest of the code — and most of it is editable in the Settings screen."

### `js/triage.js` — the rules engine
Takes what staff entered (warning-sign checkboxes, symptom text, duration, vitals, arrival source) and returns a **suggested level plus the list of reasons**.

*Say:* "Three things make this safe to show. First, it never hides its reasoning — every rule that fired is listed. Second, it never decides: it returns a suggestion and the screen asks a human to confirm. Third, it refuses to under-triage when information is missing."

*Demo tip:* type `crushing chest pain` into the symptoms box and let them watch the level switch to Critical and the reasons appear before you press anything.

### `js/waiting.js` — the estimate
A deliberately simple arithmetic model: add up the illustrative service times of the patients ahead, split them across the consultation rooms, add half of this patient's own consultation, then show a **range** rather than one number.

*Say:* "We show a range on purpose. A single number would imply a promise we cannot make — an ambulance can arrive at any moment."

### `js/store.js` — the memory and the decision log
Holds every patient, generates unique IDs, validates input a second time, orders the queue, applies status changes, and writes the history. It keeps **three separate fields**: the suggested level, the staff-confirmed level, and the override reason. Nothing overwrites the suggestion.

*Say:* "This is the honest bit. If we later ask 'did the algorithm get it right?', the answer is in the data, because we never overwrite what it suggested."

### `js/storage.js` — persistence
Saves the whole state as one JSON document after every change, and if the browser refuses to store it (private window), falls back to memory and says so on screen instead of pretending.

### `js/ui.js` — the interface kit
Toasts, dialogs and confirmation prompts. Notably, it builds confirmation dialogs from a list of fields, which is how "change the priority, but only if you write why" is enforced in one place.

### `js/charts.js` — charts that cannot fail
Charts use Chart.js from a CDN when the internet is available. If it is not, the same numbers are drawn as plain CSS bars.

*Say:* "Conference Wi-Fi is unreliable, so the app never depends on it."

### `js/router.js` + `js/views/*` — the screens
Seven pages, reachable by address (`#/dashboard`, `#/queue`, `#/patient/MF-1001`, …) and by the sidebar. Each view only reads data and renders HTML; it never changes a record itself.

### `js/views/shared.js` — one button, one behaviour
Every patient button — Open, Start, Complete, Reassess, Confirm priority, Note, Department, Cancel — is implemented **once** here, so a control behaves identically on the dashboard, the queue and the patient record.

*Say:* "We wired the buttons once so a button can never work on one page and quietly do nothing on another."

### `js/demo.js` — the fictional patients
15 invented patients chosen to make the queue visibly re-order: three critical, four high priority, four moderate, three routine, and one deliberately left **unconfirmed** to demonstrate the safety strip.

---

## 4. The six safety rules (this is the part judges remember)

Say these slowly, one finger each:

1. **Warning signs escalate instantly.** Ticking "chest pain" **or typing it** raises Level 1 and a red alert that says *seek immediate clinical assessment*. Registration never delays care.
2. **Age is never used on its own.** A 92-year-old with a routine complaint stays Routine.
3. **One soft symptom cannot reach Level 2.** High priority needs more than one signal.
4. **Missing vitals never mean "low priority".** No observations → the level is capped and staff review is requested, with the reason shown.
5. **A human always decides**, and an override without a written reason is refused.
6. **The wording never over-claims.** The disclaimer sits next to the suggestion, not buried in a footer.

*If asked "what if the algorithm is wrong?"* — "Then a clinician overrides it in two clicks and the record shows both what the system suggested and what the clinician decided, and why. The system is a prompt to think, not a replacement for thinking."

---

## 5. Two-minute live demo (the short version)

1. **Dashboard** → click **Load demo patients** → 15 records appear; point at the red emergency banner and the amber "awaiting triage confirmation" strip.
2. **Register Patient** → type `severe difficulty breathing` and `SpO2 88` → point at the live reasons panel and the emergency alert. Then press **Save without confirming priority**.
3. **Live Queue / Triage** → confirm that patient's priority, choosing a different level and leaving the reason empty first — MediFlow refuses. Add the reason, confirm, and show the queue re-order.
4. **Patient record** → **Mark as In Consultation** then **Mark as Completed** → show the status history and the timestamps.
5. **Analytics** → four charts update; point out that demo statistics are labelled as simulated.
6. **Settings** → add a new warning sign, save it, and note that the rule set is configurable without coding.

Reserve 30 seconds to show **Settings → Reset / remove demo data**, proving the fictional data is separable from anything you entered.

---

## 6. Likely questions and good answers

**"Does it diagnose?"** No. It applies transparent rules to what staff type and shows its reasons. Diagnosis is a clinical act.

**"Is it medically validated?"** No, and we do not claim it is. A real deployment would use a validated tool such as a national early warning score, under clinical governance.

**"Where is the data stored?"** In the browser for this prototype. The README documents the exact API contract for a Flask/PostgreSQL backend — the screens would not need to change.

**"What about privacy?"** Only what the workflow needs is collected: name, age and symptoms. Gender, phone, history and vitals are optional and labelled as such, and emergency registration needs just a name and an age.

**"What stops a patient being forgotten?"** The "awaiting triage confirmation" strip, the long-wait list with a one-click Reassess action, and the reassessment status.

**"Why no framework?"** So the whole thing runs from a folder with no install, no build and nothing to break in front of an audience — and so every line can be explained.

---

## 7. If something goes wrong on stage

| Symptom | Quick fix |
|---|---|
| Charts look like plain bars | Chart.js did not download — this is the built-in fallback and it is intended. Say so; it makes the offline-first point. |
| "Storage unavailable" warning | Private/incognito window. Everything still works for the session. |
| Demo data mixed with your own | **Settings → Reset / remove demo data** deletes only `DEMO` records. |
| The queue looks empty | Check the search box and the priority/department/status filters, then press **Clear filters**. Filters persist while you browse. |
| Something looks broken beyond repair | **Settings → Data management → Export** for a backup, then reload the page. |
