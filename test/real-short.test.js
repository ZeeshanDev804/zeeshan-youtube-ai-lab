import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  generateElevenLabsVoice
} from "../src/elevenLabsProvider.js";

import {
  generateGeminiImage
} from "../src/geminiImageProvider.js";

console.log("");
console.log("========================================");
console.log(" ZEESHAN AI LABS");
console.log(" REAL SHORT ASSET TEST");
console.log("========================================");
console.log("");

const outputDir = path.join(
  os.tmpdir(),
  "zeeshan-real-short-test"
);

fs.mkdirSync(outputDir, {
  recursive: true
});

const script = `
Success is not built in one day.
It is built by showing up again and again,
learning from failure,
and refusing to stop.
Your current situation is not your final destination.
Keep working, keep learning,
and keep moving forward.
`;

try {
  console.log("🎙️ Generating real AI voice...");

  const voice =
    await generateElevenLabsVoice({
      text: script,
      outputDir
    });

  console.log("");
  console.log("Voice result:");
  console.log(voice);
  console.log("");

  if (
    !voice ||
    voice.success !== true ||
    !voice.outputFile ||
    !fs.existsSync(
      voice.outputFile
    )
  ) {
    throw new Error(
      voice?.error ||
      "Real voice generation failed."
    );
  }

  const voiceStats =
    fs.statSync(
      voice.outputFile
    );

  if (voiceStats.size <= 0) {
    throw new Error(
      "Generated voice file is empty."
    );
  }

  console.log(
    "🟢 PASS: Real AI voice generated"
  );

  console.log("");
  console.log("🎨 Generating real AI visual...");

  const image =
    await generateGeminiImage({
      prompt:
        "A cinematic motivational scene of a determined young entrepreneur working late at a desk, overcoming failure and building a better future, realistic documentary photography, dramatic but positive lighting, clean composition, vertical YouTube Shorts visual."
    });

  console.log("");
  console.log("Image result:");
  console.log(image);
  console.log("");

  if (
    !image ||
    image.success !== true ||
    !image.outputFile ||
    !fs.existsSync(
      image.outputFile
    )
  ) {
    throw new Error(
      image?.error ||
      "Real image generation failed."
    );
  }

  const imageStats =
    fs.statSync(
      image.outputFile
    );

  if (imageStats.size <= 0) {
    throw new Error(
      "Generated image file is empty."
    );
  }

  console.log(
    "🟢 PASS: Real AI visual generated"
  );

  console.log("");
  console.log("========================================");
  console.log(" REAL SHORT ASSETS TEST PASSED");
  console.log("========================================");
  console.log("");

  console.log("Voice:");
  console.log(voice.outputFile);

  console.log("");

  console.log("Visual:");
  console.log(image.outputFile);

  console.log("");

} catch (error) {
  console.error("");
  console.error(
    "🔴 FAIL:",
    error?.message ||
    String(error)
  );
  console.error("");

  process.exitCode = 1;
}
