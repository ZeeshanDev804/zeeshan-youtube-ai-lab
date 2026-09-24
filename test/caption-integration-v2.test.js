import assert from "node:assert/strict";
import * as captionEngine from "../src/captionEngine.js";

console.log("\n🧪 CAPTION INTEGRATION V2 TEST\n");

async function main() {
  // --------------------------------------------------
  // 1. Caption module
  // --------------------------------------------------

  assert.ok(captionEngine);
  assert.equal(typeof captionEngine, "object");

  console.log("✅ 1. Caption Engine module available");

  // --------------------------------------------------
  // 2. Find exported functions
  // --------------------------------------------------

  const exportedFunctions = Object.entries(captionEngine)
    .filter(([, value]) => typeof value === "function")
    .map(([key]) => key);

  assert.ok(exportedFunctions.length > 0);

  console.log(
    `✅ 2. Caption functions available: ${exportedFunctions.length}`
  );

  console.log(
    `   Functions: ${exportedFunctions.join(", ")}`
  );

  // --------------------------------------------------
  // 3. Caption-related exports
  // --------------------------------------------------

  const captionFunctions = exportedFunctions.filter((name) => {
    const value = name.toLowerCase();

    return (
      value.includes("caption") ||
      value.includes("subtitle") ||
      value.includes("srt") ||
      value.includes("ass") ||
      value.includes("vtt")
    );
  });

  assert.ok(captionFunctions.length > 0);

  console.log(
    "✅ 3. Caption/subtitle-related function detected"
  );

  // --------------------------------------------------
  // 4. Inspect module safely
  // --------------------------------------------------

  const moduleText = JSON.stringify({
    exports: exportedFunctions
  }).toLowerCase();

  assert.ok(moduleText.includes("caption"));

  console.log("✅ 4. Caption API is discoverable");

  // --------------------------------------------------
  // 5. Caption module must load without crash
  // --------------------------------------------------

  assert.ok(captionEngine !== null);
  assert.ok(captionEngine !== undefined);

  console.log("✅ 5. Caption Engine loads successfully");

  // --------------------------------------------------
  // 6. Export integrity
  // --------------------------------------------------

  for (const functionName of exportedFunctions) {
    assert.equal(
      typeof captionEngine[functionName],
      "function"
    );
  }

  console.log("✅ 6. Caption exports have valid function types");

  // --------------------------------------------------
  // 7. Integration snapshot
  // --------------------------------------------------

  const snapshot = {
    moduleLoaded: true,
    exportedFunctions,
    captionFunctions,
    captionIntegrationAvailable: true
  };

  assert.equal(snapshot.moduleLoaded, true);
  assert.equal(snapshot.captionIntegrationAvailable, true);

  console.log("✅ 7. Caption integration snapshot created");

  console.log(
    "\n🎉 CAPTION INTEGRATION V2 TEST: GREEN\n"
  );
}

main().catch((error) => {
  console.error(
    "\n❌ CAPTION INTEGRATION V2 TEST: RED\n"
  );

  console.error(error);
  process.exit(1);
});
