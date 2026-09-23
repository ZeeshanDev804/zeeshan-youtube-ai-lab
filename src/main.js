import config, {
  validateConfig
} from "./config.js";

import {
  getSystemStatus,
  canRunAutomation
} from "./ceoControl.js";

import { getTrendRadar } from "./trendRadar.js";

import {
  selectTopics,
  validateTopic
} from "./topicSelector.js";

import {
  createScriptPlaceholder
} from "./scriptEngine.js";

function printHeader() {
  console.log("");
  console.log("==========================================");
  console.log("       ZEESHAN AI YOUTUBE LAB");
  console.log("       AI YOUTUBE AUTOMATION ENGINE");
  console.log("==========================================");
  console.log("");
}

async function runSystemTest() {
  printHeader();

  try {
    validateConfig();

    console.log("CONFIG: OK");

    const systemStatus = getSystemStatus();

    console.log("SYSTEM STATUS:");
    console.log(systemStatus);

    if (!canRunAutomation()) {
      console.log("");
      console.log(
        "AUTOMATION: STOPPED BY SYSTEM CONTROL"
      );
      return;
    }

    const radar = await getTrendRadar();

    console.log("");
    console.log("TREND RADAR:");
    console.log(
      `Topics found: ${radar.topicCount}`
    );
    console.log(
      `Source status: ${radar.sourceStatus}`
    );

    const selected = selectTopics(
      radar.topics,
      Math.min(
        config.system.maxDailyVideos,
        radar.topics.length
      )
    );

    console.log("");
    console.log("SELECTED TOPICS:");

    for (const topic of selected) {
      const validation = validateTopic(topic);

      if (!validation.valid) {
        console.log(
          `SKIPPED: ${validation.reason}`
        );
        continue;
      }

      const scriptJob =
        createScriptPlaceholder(topic);

      console.log(
        `- ${topic.title}`
      );

      console.log(
        `  Script status: ${scriptJob.status}`
      );
    }

    console.log("");
    console.log("SYSTEM TEST COMPLETE.");
    console.log(
      "No real YouTube upload was performed."
    );
    console.log(
      "No real AI API was called."
    );
    console.log(
      "No fake trend data was presented as live data."
    );

  } catch (error) {
    console.error("");
    console.error("SYSTEM ERROR:");
    console.error(error.message);

    process.exitCode = 1;
  }
}

async function main() {
  const testMode =
    process.argv.includes("--test");

  if (testMode) {
    await runSystemTest();
    return;
  }

  await runSystemTest();
}

main();
