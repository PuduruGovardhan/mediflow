/* ==========================================================================
   MediFlow | js/waiting.js
   --------------------------------------------------------------------------
   ILLUSTRATIVE WAITING-TIME ESTIMATE
   --------------------------------------------------------------------------
   This is a simple, fully transparent arithmetic model. It is NOT a clinical
   prediction and NOT a guarantee. The UI must always label it as an estimate
   and show the disclaimer from config.DISCLAIMERS.wait.

   How it works
     1. Find the patients ahead of this patient in the active queue.
     2. Add up their illustrative service durations (by priority level).
     3. Add the estimated remaining time of consultations already running.
     4. Spread that workload across the configured number of consultation
        rooms.
     5. Round to the configured step and return a range (+/- a percentage)
        because real waiting times vary.

   Public API
     waiting.settings()                   -> resolved settings
     waiting.estimate(patient, queue)      -> estimate object
     waiting.summary(queue)                -> aggregate figures for the UI
   ========================================================================== */

window.MediFlow = window.MediFlow || {};

MediFlow.waiting = (function () {
  'use strict';

  var cfg = MediFlow.config;
  var U = MediFlow.utils;

  function settings() {
    var fromStore = (MediFlow.store && MediFlow.store.state && MediFlow.store.state.settings) || {};
    return {
      consultRooms: Math.max(1, U.num(fromStore.consultRooms, cfg.DEFAULT_SETTINGS.consultRooms) || 1),
      waitEnabled: fromStore.waitEnabled !== false,
      spread: U.clamp(U.num(fromStore.waitSpreadPercent, cfg.DEFAULT_SETTINGS.waitSpreadPercent) || 0, 0, 90),
      roundTo: Math.max(1, U.num(fromStore.waitRoundMinutes, cfg.DEFAULT_SETTINGS.waitRoundMinutes) || 5),
      longWaitMinutes: Math.max(10, U.num(fromStore.longWaitThresholdMinutes, cfg.DEFAULT_SETTINGS.longWaitThresholdMinutes) || 60),
      serviceMinutes: (fromStore.serviceMinutes && typeof fromStore.serviceMinutes === 'object')
        ? fromStore.serviceMinutes
        : cfg.DEFAULT_SETTINGS.serviceMinutes
    };
  }

  function serviceMinutesFor(level, config) {
    var raw = (config.serviceMinutes || {})[level];
    var value = U.num(raw, cfg.PRIORITY_LEVELS[level] ? cfg.PRIORITY_LEVELS[level].serviceMinutes : 25);
    return Math.max(1, value || 25);
  }

  function roundToStep(value, step) {
    var safeStep = Math.max(1, step || 5);
    return Math.max(safeStep, Math.round(value / safeStep) * safeStep);
  }

  /** Position of a patient in the ordered active queue (1-based), or 0. */
  function positionOf(patient, queue) {
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].id === patient.id) return i + 1;
    }
    return 0;
  }

  /**
   * @param {Object} patient  the patient record (needs confirmedPriority / suggestedPriority)
   * @param {Array}  queue    the ordered active queue (see store.activeQueue())
   * @returns {Object} estimate
   */
  function estimate(patient, queue) {
    var config = settings();
    var ordered = Array.isArray(queue) ? queue : [];
    var index = positionOf(patient, ordered);

    if (patient && patient.status === 'in_consultation') {
      return {
        available: true,
        inConsultation: true,
        minutesLow: 0,
        minutesHigh: roundToStep(serviceMinutesFor(patient.confirmedPriority || patient.suggestedPriority || 4, config), config.roundTo),
        display: 'In consultation now',
        ahead: [],
        rooms: config.consultRooms,
        explanation: 'This patient is already being seen, so there is no wait left for them. The figure shown is the illustrative consultation length only.',
        disclaimer: cfg.DISCLAIMERS.wait
      };
    }

    if (!index) {
      return {
        available: false,
        minutesLow: 0,
        minutesHigh: 0,
        display: 'Not in the active queue',
        ahead: [],
        rooms: config.consultRooms,
        explanation: 'Waiting-time estimates are produced only for patients who are currently in the active queue.',
        disclaimer: cfg.DISCLAIMERS.wait
      };
    }

    var ahead = ordered.slice(0, index - 1);
    var running = ahead.filter(function (p) { return p.status === 'in_consultation'; });
    var waitingAhead = ahead.filter(function (p) { return p.status !== 'in_consultation'; });

    /* Work that must be finished before this patient starts. */
    var waitingMinutes = 0;
    var perPriority = {};
    waitingAhead.forEach(function (p) {
      var level = p.confirmedPriority || p.suggestedPriority || 4;
      var minutes = serviceMinutesFor(level, config);
      waitingMinutes += minutes;
      perPriority[level] = (perPriority[level] || 0) + 1;
    });

    /* Consultations already running: assume half of their illustrative
       duration still remains, which is a deliberately rough assumption. */
    var runningMinutes = running.reduce(function (total, p) {
      var level = p.confirmedPriority || p.suggestedPriority || 4;
      return total + serviceMinutesFor(level, config) * 0.5;
    }, 0);

    var totalWork = waitingMinutes + runningMinutes;
    var macro = totalWork / config.consultRooms;
    var ownService = serviceMinutesFor(patient.confirmedPriority || patient.suggestedPriority || 4, config) * 0.5;
    var point = macro + ownService;
    var low = roundToStep(point * (1 - config.spread / 100), config.roundTo);
    var high = roundToStep(point * (1 + config.spread / 100), config.roundTo);
    if (high < low) high = low;

    var aheadCount = ahead.length;

    return {
      available: true,
      inConsultation: false,
      position: index,
      aheadCount: aheadCount,
      ahead: ahead.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          priority: p.confirmedPriority || p.suggestedPriority,
          status: p.status,
          minutes: serviceMinutesFor(p.confirmedPriority || p.suggestedPriority || 4, config)
        };
      }),
      minutesLow: low,
      minutesHigh: high,
      display: low === high ? 'about ' + low + ' min' : 'about ' + low + '–' + high + ' min',
      rooms: config.consultRooms,
      perPriority: perPriority,
      explanation:
        aheadCount === 0
          ? 'Nobody is ahead of this patient in the queue. The estimate still allows for the consultation itself and for current activity.'
          : aheadCount + ' ' + U.plural(aheadCount, 'patient') + ' ahead. Their illustrative service durations total ' +
            Math.round(totalWork) + ' min, shared across ' + config.consultRooms + ' consultation ' +
            U.plural(config.consultRooms, 'room') + ', plus half of this patient\u2019s own consultation time.',
      disclaimer: cfg.DISCLAIMERS.wait
    };
  }

  /** Aggregates used by the dashboard and analytics pages. */
  function summary(queue) {
    var ordered = Array.isArray(queue) ? queue : [];
    var config = settings();
    var waitingPatients = ordered.filter(function (p) { return p.status !== 'in_consultation'; });
    var configuredWorkload = waitingPatients.reduce(function (total, p) {
      return total + serviceMinutesFor(p.confirmedPriority || p.suggestedPriority || 4, config);
    }, 0);
    var averageWaitMinutes = U.average(waitingPatients, function (p) { return U.minutesBetween(p.registeredAt); });
    var longest = waitingPatients.reduce(function (worst, p) {
      var elapsed = U.minutesBetween(p.registeredAt);
      return elapsed > (worst ? worst.elapsed : -1) ? { patient: p, elapsed: elapsed } : worst;
    }, null);

    return {
      waitingCount: waitingPatients.length,
      inConsultationCount: ordered.length - waitingPatients.length,
      roomCount: config.consultRooms,
      backlogMinutes: Math.round(configuredWorkload),
      queueDrainMinutes: Math.round(configuredWorkload / config.consultRooms),
      averageWaitMinutes: Math.round(averageWaitMinutes),
      longestWait: longest,
      overThreshold: waitingPatients.filter(function (p) {
        return U.minutesBetween(p.registeredAt) >= config.longWaitMinutes;
      }),
      longWaitMinutes: config.longWaitMinutes
    };
  }

  return {
    settings: settings,
    estimate: estimate,
    summary: summary,
    serviceMinutesFor: serviceMinutesFor
  };
})();
