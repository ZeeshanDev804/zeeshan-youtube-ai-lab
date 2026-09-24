import "dotenv/config";

import {
  getCEOAutomationStatus
} from "./ceoAutomationGuard.js";

import {
  getSchedulerStatus
} from "./worldwideScheduler.js";

import {
  getScheduledRunnerStatus
} from "./scheduledAutomationRunner.js";


const DAILY_TARGET_VIDEOS = 5;


function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function safeBoolean(value) {
  return Boolean(value);
}


/*
|--------------------------------------------------------------------------
| MAIN DASHBOARD STATUS
|--------------------------------------------------------------------------
*/

export async function getAutomationDashboardStatus() {

  const [
    ceo,
    scheduler,
    runner
  ] = await Promise.all([
    getCEOAutomationStatus(),
    getSchedulerStatus(),
    getScheduledRunnerStatus()
  ]);


  const startedToday =
    safeNumber(
      ceo?.daily?.started
    );


  const completedToday =
    safeNumber(
      ceo?.daily?.completed
    );


  const targetReached =
    startedToday >=
    DAILY_TARGET_VIDEOS;


  const overTarget =
    Math.max(
      0,
      startedToday -
        DAILY_TARGET_VIDEOS
    );


  const remainingToTarget =
    Math.max(
      0,
      DAILY_TARGET_VIDEOS -
        startedToday
    );


  return {
    success: true,

    system: {
      name:
        "ZEESHAN AI LABS",

      component:
        "YouTube AI Automation System",

      status:
        ceo?.emergencyStop
          ? "EMERGENCY_STOP"
          : ceo?.mode === "STOP"
            ? "STOPPED"
            : "ONLINE"
    },


    /*
     * CEO control
     */

    ceo: {
      mode:
        ceo?.mode || "REVIEW",

      emergencyStop:
        safeBoolean(
          ceo?.emergencyStop
        ),

      emergencyStopReason:
        ceo?.emergencyStopReason ||
        null
    },


    /*
     * DAILY CONTENT POLICY
     *
     * 5 = target.
     * NOT maximum.
     */

    dailyContent: {

      target:
        DAILY_TARGET_VIDEOS,

      targetLabel:
        "5 videos/day target",

      started:
        startedToday,

      completed:
        completedToday,

      remainingToTarget,

      targetReached,

      overTarget,

      hardMaximum:
        false,

      maximum:
        null,

      maximumVideosPerDay:
        null,

      canExceedTarget:
        true,

      qualityOverQuantity:
        true,

      weakTopicsBlocked:
        true,

      repetitiveTopicsBlocked:
        true,

      unsafeTopicsBlocked:
        true
    },


    /*
     * IMPORTANT:
     *
     * These values are deliberately
     * separate from the target.
     */

    productionPolicy: {

      ifTwoGoodTopics:
        "Allow 2",

      ifFiveGoodTopics:
        "Allow 5",

      ifMoreThanFiveGoodTopics:
        "Allow more than 5",

      ifNoGoodTopics:
        "Do not force content",

      targetIsHardLimit:
        false
    },


    /*
     * Scheduler
     */

    scheduler: {

      status:
        scheduler?.success
          ? "CONNECTED"
          : "ERROR",

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      hardDailyMaximum:
        false,

      canContinueBeyondTarget:
        true,

      qualityOverQuantity:
        true,

      regions:
        scheduler?.regions ||
        {}
    },


    /*
     * Scheduled runner
     */

    scheduledRunner: {

      status:
        runner?.success
          ? "CONNECTED"
          : "ERROR",

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      targetIsHardMaximum:
        false,

      canContinueBeyondTarget:
        true,

      regions:
        runner?.regions ||
        []
    },


    /*
     * Safety gates
     */

    safety: {

      emergencyStop:
        safeBoolean(
          ceo?.emergencyStop
        ),

      stopMode:
        ceo?.mode === "STOP",

      mediumRiskNeedsApproval:
        true,

      highRiskNeedsApproval:
        true,

      reviewModeNeedsApproval:
        true,

      duplicateProtection:
        true,

      copyrightProtection:
        true,

      qualityGate:
        true
    },


    /*
     * YouTube connection status.
     *
     * This dashboard does not pretend
     * that OAuth is connected unless the
     * underlying system reports it.
     */

    youtube: {
      status:
        "CHECK_PRODUCTION_PIPELINE"
    },


    /*
     * Human-readable summary
     */

    summary: {

      message:
        targetReached
          ? overTarget > 0
            ? `Daily target of ${DAILY_TARGET_VIDEOS} reached. System may continue because the target is not a hard maximum.`
            : `Daily target of ${DAILY_TARGET_VIDEOS} reached. Additional strong topics may still be processed.`
          : `${remainingToTarget} more video(s) needed to reach the daily target of ${DAILY_TARGET_VIDEOS}.`,

      target:
        DAILY_TARGET_VIDEOS,

      started:
        startedToday,

      completed:
        completedToday,

      hardMaximum:
        false
    },


    timestamp:
      new Date().toISOString()
  };
}


/*
|--------------------------------------------------------------------------
| SIMPLE STATUS
|--------------------------------------------------------------------------
*/

export async function getSimpleAutomationStatus() {

  const status =
    await getAutomationDashboardStatus();


  return {
    success:
      status.success,

    system:
      status.system.status,

    mode:
      status.ceo.mode,

    emergencyStop:
      status.ceo.emergencyStop,

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    startedToday:
      status.dailyContent.started,

    completedToday:
      status.dailyContent.completed,

    targetReached:
      status.dailyContent.targetReached,

    overTarget:
      status.dailyContent.overTarget,

    hardDailyMaximum:
      false,

    canContinueBeyondTarget:
      true
  };
}


/*
|--------------------------------------------------------------------------
| DAILY POLICY
|--------------------------------------------------------------------------
*/

export function getDailyContentPolicy() {

  return {
    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardMaximum:
      false,

    maximumVideosPerDay:
      null,

    canExceedTarget:
      true,

    qualityOverQuantity:
      true,

    rules: {

      fewerThanTarget:
        "Allowed",

      exactlyTarget:
        "Allowed",

      moreThanTarget:
        "Allowed",

      weakTopics:
        "Blocked",

      riskyTopics:
        "Blocked or sent to approval",

      repetitiveTopics:
        "Blocked",

      unsafeContent:
        "Blocked"
    }
  };
}


/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

export async function getAutomationDashboardHealth() {

  const status =
    await getAutomationDashboardStatus();


  const healthy =
    status.system.status ===
      "ONLINE" &&
    !status.ceo.emergencyStop;


  return {
    success: true,

    healthy,

    status:
      healthy
        ? "HEALTHY"
        : "ATTENTION_REQUIRED",

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false,

    canContinueBeyondTarget:
      true,

    timestamp:
      new Date().toISOString()
  };
}


/*
|--------------------------------------------------------------------------
| DEFAULT EXPORT
|--------------------------------------------------------------------------
*/

export default {

  getAutomationDashboardStatus,

  getSimpleAutomationStatus,

  getDailyContentPolicy,

  getAutomationDashboardHealth
};