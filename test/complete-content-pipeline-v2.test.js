import assert from "node:assert/strict";

import {
  researchTopic
} from "../src/researchEngine.js";

import {
  analyzeSafety
} from "../src/safetyGuard.js";

import {
  checkCopyrightSafety
} from "../src/copyrightGuard.js";

import {
  checkDuplicateContent
} from "../src/duplicateGuard.js";

import {
  createTTSJob
} from "../src/ttsProvider.js";

import {
  createVisualJob
} from "../src/visualProvider.js";

import {
  getShortPipelineStatus
} from "../src/shortPipeline.js";

console.log("\n🧪 COMPLETE CONTENT PIPELINE V2 TEST\n");

async function main() {

  // --------------------------------------------------
  // 1. Research Engine
  // --------------------------------------------------

  assert.equal(typeof researchTopic, "function");

  const research = await researchTopic({
    topic: "AI technology and useful productivity tools"
  });

  assert.ok(research);
  assert.equal(typeof research, "object");

  console.log("✅ 1. Research Engine connected");

  // --------------------------------------------------
  // 2. Safety Guard
  // --------------------------------------------------

  assert.equal(typeof analyzeSafety, "function");

  const safety = await analyzeSafety({
    topic: "AI technology and useful productivity tools",
    research
  });

  assert.ok(safety);
  assert.equal(typeof safety, "object");

  console.log("✅ 2. Safety Guard connected");

  // --------------------------------------------------
  // 3. Copyright Guard
  // --------------------------------------------------

  assert.equal(typeof checkCopyrightSafety, "function");

  const copyright = await checkCopyrightSafety({
    title: "AI Productivity Tools",
    script:
      "AI tools can help people organize work, learn faster, and automate repetitive tasks."
  });

  assert.ok(copyright);
  assert.equal(typeof copyright, "object");

  console.log("✅ 3. Copyright Guard connected");

  // --------------------------------------------------
  // 4. Duplicate Guard
  // --------------------------------------------------

  assert.equal(typeof checkDuplicateContent, "function");

  const duplicate = await checkDuplicateContent({
    title: "AI Productivity Tools",
    script:
      "AI tools can help people organize work, learn faster, and automate repetitive tasks.",
    existingContent: []
  });

  assert.ok(duplicate);
  assert.equal(typeof duplicate, "object");

  console.log("✅ 4. Duplicate Guard connected");

  // --------------------------------------------------
  // 5. TTS / Voice stage
  // --------------------------------------------------

  assert.equal(typeof createTTSJob, "function");

  const voiceJob = await createTTSJob({
    text:
      "AI tools can help people save time and work more efficiently."
  });

  assert.ok(voiceJob);
  assert.equal(typeof voiceJob, "object");

  console.log("✅ 5. Voice/TTS stage connected");

  // --------------------------------------------------
  // 6. Visual stage
  // --------------------------------------------------

  assert.equal(typeof createVisualJob, "function");

  const visualJob = await createVisualJob({
    prompt:
      "Vertical YouTube Shorts visual about AI productivity and modern technology.",
    aspectRatio: "9:16"
  });

  assert.ok(visualJob);
  assert.equal(typeof visualJob, "object");

  console.log("✅ 6. Visual stage connected");

  // --------------------------------------------------
  // 7. Short Pipeline status
  // --------------------------------------------------

  assert.equal(typeof getShortPipelineStatus, "function");

  const pipelineStatus = await getShortPipelineStatus();

  assert.ok(pipelineStatus);
  assert.equal(typeof pipelineStatus, "object");

  console.log("✅ 7. Short Pipeline status connected");

  // --------------------------------------------------
  // 8. Final integration snapshot
  // --------------------------------------------------

  const snapshot = {
    research,
    safety,
    copyright,
    duplicate,
    voiceJob,
    visualJob,
    pipelineStatus
  };

  assert.ok(snapshot.research);
  assert.ok(snapshot.safety);
  assert.ok(snapshot.copyright);
  assert.ok(snapshot.duplicate);
  assert.ok(snapshot.voiceJob);
  assert.ok(snapshot.visualJob);
  assert.ok(snapshot.pipelineStatus);

  console.log("✅ 8. Complete content pipeline snapshot created");

  console.log(
    "\n🎉 COMPLETE CONTENT PIPELINE V2 TEST: GREEN\n"
  );
}

main().catch((error) => {
  console.error(
    "\n❌ COMPLETE CONTENT PIPELINE V2 TEST: RED\n"
  );

  console.error(error);
  process.exit(1);
});
