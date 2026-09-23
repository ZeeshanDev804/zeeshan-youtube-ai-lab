import "dotenv/config";

import {
  getCEOAutomationStatus
} from "./ceoAutomationGuard.js";

import {
  getReliabilityStatus
} from "./automationReliability.js";

import {
  getSchedulerStatus
} from "./worldwideScheduler.js";

import {
  getScheduledAutomationStatus
} from "./scheduledAutomationRunner.js";

import {
  getAutomationStatus
} from "./automationOrchestrator.js";

export async function getLiveAutomationDashboard() {
  const [
    ceo,
    reliability,
    scheduler,
    runner,
    orchestrator
  ] = await Promise.all([
    getCEOAutomationStatus(),
    getReliabilityStatus(),
    getSchedulerStatus(),
    getScheduledAutomationStatus(),
    getAutomationStatus()
  ]);

  return {
    success: true,

    generatedAt:
      new Date().toISOString(),

    system: {
      status:
        "ONLINE",

      automation:
        "CONNECTED",

      dashboard:
        "CONNECTED",

      youtube:
        "NOT_CONNECTED",

      googleCloud:
        "NOT_CONNECTED"
    },

    ceo: {
      mode:
        ceo.mode,

      emergencyStop:
        ceo.emergencyStop,

      emergencyStopReason:
        ceo.emergencyStopReason,

      dailyMaximum:
        ceo.daily.maximum,

      startedToday:
        ceo.daily.started,

      completedToday:
        ceo.daily.completed,

      remainingToday:
        ceo.daily.remaining
    },

    scheduler: {
      status:
        scheduler.status,

      regions:
        scheduler.regions,

      remainingToday:
        scheduler.remainingToday
    },

    reliability: {
      status:
        reliability.status,

      totalJobs:
        reliability.jobs.total,

      activeJobs:
        reliability.jobs.active,

      failedJobs:
        reliability.jobs.failed,

      completedJobs:
        reliability.jobs.completed,

      recoveryRequired:
        reliability.jobs
          .recoveryRequired,

      activeLocks:
        reliability.locks
    },

    orchestrator: {
      status:
        "CONNECTED",

      data:
        orchestrator
    },

    runner: {
      status:
        runner.pipeline
          ?.orchestrator ||
        "UNKNOWN"
    },

    safety: {
      emergencyStop:
        ceo.emergencyStop,

      stopMode:
        ceo.mode ===
        "STOP",

      reviewMode:
        ceo.mode ===
        "REVIEW",

      mediumRiskApproval:
        true,

      highRiskApproval:
        true,

      dailyLimit:
        5
    }
  };
}

export async function getDashboardHealth() {
  const dashboard =
    await getLiveAutomationDashboard();

  const healthy =
    dashboard.system.status ===
      "ONLINE" &&
    dashboard.ceo.emergencyStop ===
      false &&
    dashboard.reliability.status ===
      "READY";

  return {
    success: true,

    healthy,

    status:
      healthy
        ? "HEALTHY"
        : "ATTENTION_REQUIRED",

    generatedAt:
      dashboard.generatedAt,

    checks: {
      system:
        dashboard.system.status,

      ceoControl:
        dashboard.ceo.emergencyStop
          ? "EMERGENCY_STOP"
          : "READY",

      reliability:
        dashboard.reliability.status,

      scheduler:
        dashboard.scheduler.status,

      orchestrator:
        dashboard.runner.status
    }
  };
}

export default {
  getLiveAutomationDashboard,
  getDashboardHealth
};
