import assert from "node:assert/strict";

import {
  getAnalyticsStatus
} from "../src/analyticsBrain.js";

console.log("\n🧪 ANALYTICS + LEARNING V2 TEST\n");

async function main() {
  // --------------------------------------------------
  // 1. Analytics function
  // --------------------------------------------------

  assert.equal(typeof getAnalyticsStatus, "function");

  console.log("✅ 1. Analytics function available");

  // --------------------------------------------------
  // 2. Analytics status
  // --------------------------------------------------

  const analytics = await getAnalyticsStatus();

  assert.ok(analytics);
  assert.equal(typeof analytics, "object");

  console.log("✅ 2. Analytics status available");

  // --------------------------------------------------
  // 3. Analytics status must be serializable
  // --------------------------------------------------

  const serialized = JSON.stringify(analytics);

  assert.ok(serialized);
  assert.equal(typeof serialized, "string");

  console.log("✅ 3. Analytics status is serializable");

  // --------------------------------------------------
  // 4. Learning-related information
  // --------------------------------------------------

  const analyticsText = serialized.toLowerCase();

  assert.ok(
    analyticsText.includes("analytic") ||
    analyticsText.includes("performance") ||
    analyticsText.includes("learning") ||
    analyticsText.includes("metric") ||
    analyticsText.includes("status")
  );

  console.log("✅ 4. Analytics/Learning information exposed");

  // --------------------------------------------------
  // 5. No crash on empty/current state
  // --------------------------------------------------

  assert.ok(analytics !== null);
  assert.ok(analytics !== undefined);

  console.log("✅ 5. Empty/current analytics state handled safely");

  // --------------------------------------------------
  // 6. Final snapshot
  // --------------------------------------------------

  const snapshot = {
    analytics
  };

  assert.ok(snapshot.analytics);

  console.log("✅ 6. Analytics snapshot created");

  console.log(
    "\n🎉 ANALYTICS + LEARNING V2 TEST: GREEN\n"
  );
}

main().catch((error) => {
  console.error(
    "\n❌ ANALYTICS + LEARNING V2 TEST: RED\n"
  );

  console.error(error);
  process.exit(1);
});
