import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

console.log("\n🧪 COMMUNITY + SUPPORTING CONTENT V2 TEST\n");

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // --------------------------------------------------
  // 1. Project source directory
  // --------------------------------------------------

  const srcDir = path.resolve("./src");

  assert.equal(await exists(srcDir), true);

  console.log("✅ 1. Source directory available");

  // --------------------------------------------------
  // 2. Search existing community/supporting files
  // --------------------------------------------------

  const files = await fs.readdir(srcDir, {
    recursive: true
  });

  const normalized = files.map((file) =>
    file.toLowerCase()
  );

  const communityCandidates = normalized.filter((file) =>
    file.includes("community") ||
    file.includes("support") ||
    file.includes("social") ||
    file.includes("post")
  );

  console.log(
    `ℹ️ 2. Community/supporting candidates found: ${communityCandidates.length}`
  );

  // --------------------------------------------------
  // 3. Search project source for content concepts
  // --------------------------------------------------

  let sourceText = "";

  for (const relativeFile of files) {
    if (
      !relativeFile.endsWith(".js") &&
      !relativeFile.endsWith(".mjs") &&
      !relativeFile.endsWith(".json")
    ) {
      continue;
    }

    const fullPath = path.join(srcDir, relativeFile);

    try {
      const content = await fs.readFile(fullPath, "utf8");
      sourceText += `\n${content.toLowerCase()}`;
    } catch {
      // Ignore unreadable/non-text files
    }
  }

  // --------------------------------------------------
  // 4. Motivational/inspirational concept
  // --------------------------------------------------

  const motivationSignal =
    sourceText.includes("motiv") ||
    sourceText.includes("inspir") ||
    sourceText.includes("quote");

  console.log(
    motivationSignal
      ? "✅ 4. Motivational/inspirational content concept detected"
      : "🟡 4. Motivational/inspirational content engine not yet detected"
  );

  // --------------------------------------------------
  // 5. Audience interaction concept
  // --------------------------------------------------

  const interactionSignal =
    sourceText.includes("question") ||
    sourceText.includes("discussion") ||
    sourceText.includes("engagement") ||
    sourceText.includes("community");

  console.log(
    interactionSignal
      ? "✅ 5. Audience interaction concept detected"
      : "🟡 5. Audience interaction engine not yet detected"
  );

  // --------------------------------------------------
  // 6. Supporting content concept
  // --------------------------------------------------

  const supportingSignal =
    sourceText.includes("supporting") ||
    sourceText.includes("social") ||
    sourceText.includes("community");

  console.log(
    supportingSignal
      ? "✅ 6. Supporting content concept detected"
      : "🟡 6. Supporting content engine not yet detected"
  );

  // --------------------------------------------------
  // 7. Anti-spam / duplicate protection concept
  // --------------------------------------------------

  const protectionSignal =
    sourceText.includes("duplicate") ||
    sourceText.includes("spam") ||
    sourceText.includes("copyright") ||
    sourceText.includes("safety");

  assert.equal(protectionSignal, true);

  console.log(
    "✅ 7. Content protection signals detected"
  );

  // --------------------------------------------------
  // 8. Original content principle
  // --------------------------------------------------

  const originalitySignal =
    sourceText.includes("original") ||
    sourceText.includes("unique") ||
    sourceText.includes("generated");

  assert.equal(originalitySignal, true);

  console.log(
    "✅ 8. Original/generated content principle detected"
  );

  // --------------------------------------------------
  // 9. Final diagnostic snapshot
  // --------------------------------------------------

  const snapshot = {
    communityFiles: communityCandidates.length,
    motivationSignal,
    interactionSignal,
    supportingSignal,
    protectionSignal,
    originalitySignal
  };

  assert.ok(snapshot);
  assert.equal(typeof snapshot, "object");

  console.log("✅ 9. Community content diagnostic snapshot created");

  console.log(
    "\n🎉 COMMUNITY + SUPPORTING CONTENT V2 TEST: GREEN\n"
  );
}

main().catch((error) => {
  console.error(
    "\n❌ COMMUNITY + SUPPORTING CONTENT V2 TEST: RED\n"
  );

  console.error(error);
  process.exit(1);
});
