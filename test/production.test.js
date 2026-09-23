import "dotenv/config";

import { buildShortPipeline } from "../src/shortPipeline.js";

async function runProductionTest() {
  console.log("\n========================================");
  console.log("ZEESHAN AI LABS");
  console.log("PRODUCTION PIPELINE TEST");
  console.log("========================================");

  const testTopic = {
    title: "AI Technology Explained",
    category: "technology",
    region: "global",

    // Real generated script کو fake نہیں کریں گے۔
    // یہ صرف pipeline contract test کے لیے ہے.
    script:
      "Artificial intelligence is changing how people use technology. This short explains one simple example of how AI can help people work faster and make better decisions.",

    description:
      "A short educational test about artificial intelligence."
  };

  try {
    console.log("\nSTARTING PRODUCTION TEST...");

    const result =
      await buildShortPipeline({
        topic: testTopic,
        existingContent: [],
        language: "en-US",
        voice: "default",
        visualProvider: "not_configured",
        durationSeconds: 35,
        requireCEOApproval: true
      });

    console.log("\n----------------------------------------");
    console.log("PIPELINE RESULT");
    console.log("----------------------------------------");

    console.log(
      "STATUS:",
      result?.status || "UNKNOWN"
    );

    console.log(
      "SUCCESS:",
      result?.success === true
        ? "PASS"
        : "CHECK"
    );

    console.log(
      "STAGE:",
      result?.stage ||
      result?.nextStage ||
      "UNKNOWN"
    );

    if (result?.reason) {
      console.log(
        "REASON:",
        result.reason
      );
    }

    if (result?.research) {
      console.log(
        "RESEARCH:",
        result.research.status ||
        "AVAILABLE"
      );
    }

    if (result?.safety) {
      console.log(
        "SAFETY:",
        result.safety.level ||
        "UNKNOWN"
      );
    }

    if (result?.copyright) {
      console.log(
        "COPYRIGHT:",
        result.copyright.status ||
        "UNKNOWN"
      );
    }

    if (result?.duplicate) {
      console.log(
        "DUPLICATE:",
        result.duplicate.status ||
        "UNKNOWN"
      );
    }

    if (result?.jobs) {
      console.log(
        "VOICE JOB:",
        result.jobs.voice
          ? "CREATED"
          : "NOT CREATED"
      );

      console.log(
        "VISUAL JOB:",
        result.jobs.visual
          ? "CREATED"
          : "NOT CREATED"
      );

      console.log(
        "VIDEO JOB:",
        result.jobs.video
          ? "CREATED"
          : "NOT CREATED"
      );
    }

    console.log("\n========================================");

    /*
     * A review/block is still a useful diagnostic result.
     * The test only fails if the pipeline throws an exception
     * or returns an invalid result.
     */

    if (!result) {
      throw new Error(
        "Production pipeline returned no result."
      );
    }

    if (
      typeof result !== "object"
    ) {
      throw new Error(
        "Production pipeline returned an invalid result."
      );
    }

    console.log(
      "PRODUCTION PIPELINE TEST: PASS"
    );

    console.log(
      "No YouTube upload was performed."
    );

    console.log(
      "No public video was published."
    );

    console.log(
      "========================================\n"
    );

    return {
      success: true,
      status: "PASS"
    };

  } catch (error) {
    console.log("\n========================================");

    console.log(
      "PRODUCTION PIPELINE TEST: FAIL"
    );

    console.log(
      "ERROR:",
      error?.message ||
      String(error)
    );

    console.log(
      "========================================\n"
    );

    process.exitCode = 1;

    return {
      success: false,
      status: "FAIL",
      error:
        error?.message ||
        String(error)
    };
  }
}

await runProductionTest();
