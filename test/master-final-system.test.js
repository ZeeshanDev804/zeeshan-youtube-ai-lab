import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  getAutomationStatus
} from "../src/automationOrchestrator.js";

import {
  getFinalShortProductionStatus
} from "../src/finalShortProductionPipeline.js";

import {
  getFinalShortQAStatus
} from "../src/finalShortQAPipeline.js";

import {
  getFinalShortRendererStatus
} from "../src/finalShortRenderer.js";

import {
  getShortQualityPipelineStatus
} from "../src/shortQualityPipeline.js";

import {
  getVideoQualityGuardStatus
} from "../src/videoQualityGuard.js";

import {
  getShortProductionControllerStatus
} from "../src/shortProductionController.js";

import {
  getCEOAutomationStatus
} from "../src/ceoAutomationGuard.js";

import {
  getWorldwideSchedulerStatus
} from "../src/worldwideScheduler.js";

import {
  getAutomationDashboardStatus
} from "../src/automationDashboardStatus.js";

import {
  getFinalProductionProtectionHealth
} from "../src/finalProductionProtection.js";

import {
  getContentLearningReport
} from "../src/contentLearningIntegration.js";

function checkStatus(name, result) {
  assert.ok(
    result,
    `${name}: returned no status`
  );

  assert.notEqual(
    result.status,
    "ERROR",
    `${name}: status is ERROR`
  );

  return result;
}

test(
  "MASTER FINAL SYSTEM AUDIT",
  async () => {
    const results = {};

    results.automation =
      checkStatus(
        "Automation Orchestrator",
        await getAutomationStatus()
      );

    results.production =
      checkStatus(
        "Final Short Production",
        getFinalShortProductionStatus()
      );

    results.qa =
      checkStatus(
        "Final Short QA",
        getFinalShortQAStatus()
      );

    results.renderer =
      checkStatus(
        "Final Short Renderer",
        getFinalShortRendererStatus()
      );

    results.quality =
      checkStatus(
        "Short Quality Pipeline",
        getShortQualityPipelineStatus()
      );

    results.videoQuality =
      checkStatus(
        "Video Quality Guard",
        getVideoQualityGuardStatus()
      );

    results.controller =
      checkStatus(
        "Short Production Controller",
        getShortProductionControllerStatus()
      );

    results.ceo =
      checkStatus(
        "CEO Automation Guard",
        getCEOAutomationStatus()
      );

    results.scheduler =
      checkStatus(
        "Worldwide Scheduler",
        getWorldwideSchedulerStatus()
      );

    results.dashboard =
      checkStatus(
        "Automation Dashboard",
        await getAutomationDashboardStatus()
      );

    results.protection =
      checkStatus(
        "Final Production Protection",
        await getFinalProductionProtectionHealth()
      );

    results.learning =
      checkStatus(
        "Content Learning",
        await getContentLearningReport()
      );

    for (const [name, result] of Object.entries(results)) {
      console.log(
        `MASTER CHECK: ${name} -> ${result.status || "OK"}`
      );
    }

    assert.ok(
      results.production.configured !== false,
      "Final production is not configured"
    );

    assert.ok(
      results.qa.configured !== false,
      "Final QA is not configured"
    );

    assert.ok(
      results.renderer.configured !== false,
      "Final renderer is not configured"
    );

    assert.ok(
      results.quality.configured !== false,
      "Quality pipeline is not configured"
    );

    assert.ok(
      results.videoQuality.configured !== false,
      "Video quality guard is not configured"
    );

    assert.ok(
      results.controller.configured !== false,
      "Production controller is not configured"
    );

    assert.ok(
      results.ceo.configured !== false,
      "CEO automation guard is not configured"
    );

    assert.ok(
      results.scheduler.configured !== false,
      "Worldwide scheduler is not configured"
    );

    assert.ok(
      results.dashboard.configured !== false,
      "Automation dashboard is not configured"
    );

    assert.ok(
      results.protection.configured !== false,
      "Final production protection is not configured"
    );

    assert.ok(
      results.learning !== null,
      "Content learning status is unavailable"
    );

    assert.ok(
      Array.isArray(
        results.automation.pipeline
      ),
      "Automation pipeline is missing"
    );

    assert.ok(
      results.automation.pipeline.length >= 10,
      "Automation pipeline is incomplete"
    );

    assert.ok(
      results.production.stages?.length >= 5,
      "Final production stages are incomplete"
    );

    assert.ok(
      results.qa.checks?.length >= 5,
      "Final QA checks are incomplete"
    );

    assert.ok(
      results.videoQuality.requirements,
      "Video quality requirements are missing"
    );

    assert.equal(
      results.videoQuality.requirements.resolution,
      "1080x1920",
      "Video resolution requirement is incorrect"
    );

    assert.equal(
      results.videoQuality.requirements.format,
      "MP4",
      "Video format requirement is incorrect"
    );

    assert.equal(
      results.videoQuality.requirements.videoCodec,
      "H264",
      "Video codec requirement is incorrect"
    );

    assert.equal(
      results.videoQuality.requirements.audioCodec,
      "AAC",
      "Audio codec requirement is incorrect"
    );

    assert.ok(
      results.ceo.automation ||
      results.ceo.mode ||
      results.ceo.status,
      "CEO automation status data is missing"
    );

    assert.ok(
      results.scheduler.regions ||
      results.scheduler.schedule ||
      results.scheduler.status,
      "Worldwide scheduler data is missing"
    );

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "MASTER FINAL SYSTEM AUDIT COMPLETE"
    );
    console.log(
      "========================================"
    );

    console.log(
      "Core architecture: CHECKED"
    );

    console.log(
      "Production pipeline: CHECKED"
    );

    console.log(
      "Final QA pipeline: CHECKED"
    );

    console.log(
      "Video quality requirements: CHECKED"
    );

    console.log(
      "CEO safety system: CHECKED"
    );

    console.log(
      "Worldwide scheduler: CHECKED"
    );

    console.log(
      "Automation orchestrator: CHECKED"
    );

    console.log(
      "Dashboard: CHECKED"
    );

    console.log(
      "Learning system: CHECKED"
    );

    console.log(
      "Final production protection: CHECKED"
    );

    console.log(
      "========================================"
    );

    console.log(
      "IMPORTANT: This test validates system"
    );

    console.log(
      "integration/status. Real ElevenLabs,"
    );

    console.log(
      "Gemini image generation and YouTube"
    );

    console.log(
      "OAuth still require real credential tests."
    );

    console.log(
      "========================================"
    );
  }
);
