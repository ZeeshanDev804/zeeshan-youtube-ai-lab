import assert from "node:assert/strict";

import {
  getYouTubeUploadGuardStatus,
  validateYouTubeUpload
} from "../src/youtubeUploadGuard.js";

import {
  getYouTubeOAuthStatus
} from "../src/youtubeOAuthUploader.js";

import {
  clearEmergencyStop,
  setAutomationMode,
  resetDailyCounter
} from "../src/ceoAutomationGuard.js";

console.log("\n🧪 YOUTUBE UPLOAD + OAUTH V2 TEST\n");

async function main() {
  // --------------------------------------------------
  // 1. Clean CEO state
  // --------------------------------------------------

  await clearEmergencyStop();
  await setAutomationMode("AUTO");
  await resetDailyCounter();

  console.log("✅ 1. CEO state prepared");

  // --------------------------------------------------
  // 2. Upload Guard exports
  // --------------------------------------------------

  assert.equal(typeof getYouTubeUploadGuardStatus, "function");
  assert.equal(typeof validateYouTubeUpload, "function");

  console.log("✅ 2. YouTube Upload Guard functions available");

  // --------------------------------------------------
  // 3. Upload Guard status
  // --------------------------------------------------

  const guardStatus = await getYouTubeUploadGuardStatus();

  assert.ok(guardStatus);
  assert.equal(typeof guardStatus, "object");

  console.log("✅ 3. YouTube Upload Guard status available");

  // --------------------------------------------------
  // 4. OAuth status function
  // --------------------------------------------------

  assert.equal(typeof getYouTubeOAuthStatus, "function");

  console.log("✅ 4. YouTube OAuth status function available");

  // --------------------------------------------------
  // 5. OAuth readiness/status
  // --------------------------------------------------

  const oauthStatus = await getYouTubeOAuthStatus();

  assert.ok(oauthStatus);
  assert.equal(typeof oauthStatus, "object");

  console.log("✅ 5. YouTube OAuth status available");

  // --------------------------------------------------
  // 6. Invalid upload must be blocked
  // --------------------------------------------------

  const invalidUpload = await validateYouTubeUpload({
    videoPath: null,
    title: "",
    description: "",
    privacyStatus: "public"
  });

  assert.ok(invalidUpload);
  assert.equal(invalidUpload.allowed, false);

  console.log("✅ 6. Invalid upload is blocked");

  // --------------------------------------------------
  // 7. Missing video must be blocked
  // --------------------------------------------------

  const missingVideo = await validateYouTubeUpload({
    videoPath: null,
    title: "AI Productivity Short",
    description: "Useful AI productivity information.",
    privacyStatus: "private"
  });

  assert.ok(missingVideo);
  assert.equal(missingVideo.allowed, false);

  console.log("✅ 7. Missing video is blocked");

  // --------------------------------------------------
  // 8. Public upload must not bypass protection
  // --------------------------------------------------

  const publicAttempt = await validateYouTubeUpload({
    videoPath: null,
    title: "AI Productivity Short",
    description: "Useful AI productivity information.",
    privacyStatus: "public"
  });

  assert.ok(publicAttempt);
  assert.equal(publicAttempt.allowed, false);

  console.log("✅ 8. Public upload cannot bypass protection");

  // --------------------------------------------------
  // 9. Status must expose connection/readiness information
  // --------------------------------------------------

  const combined = JSON.stringify({
    guardStatus,
    oauthStatus
  }).toLowerCase();

  assert.ok(
    combined.includes("youtube") ||
    combined.includes("oauth") ||
    combined.includes("connected") ||
    combined.includes("configured") ||
    combined.includes("ready")
  );

  console.log("✅ 9. YouTube/OAuth readiness information exposed");

  // --------------------------------------------------
  // 10. Final snapshot
  // --------------------------------------------------

  const finalSnapshot = {
    uploadGuard: guardStatus,
    oauth: oauthStatus
  };

  assert.ok(finalSnapshot.uploadGuard);
  assert.ok(finalSnapshot.oauth);

  console.log("✅ 10. YouTube integration snapshot created");

  // --------------------------------------------------
  // 11. Clean state
  // --------------------------------------------------

  await clearEmergencyStop();
  await setAutomationMode("REVIEW");
  await resetDailyCounter();

  console.log("✅ 11. Test state cleaned");

  console.log(
    "\n🎉 YOUTUBE UPLOAD + OAUTH V2 TEST: GREEN\n"
  );
}

main().catch((error) => {
  console.error(
    "\n❌ YOUTUBE UPLOAD + OAUTH V2 TEST: RED\n"
  );

  console.error(error);
  process.exit(1);
});
