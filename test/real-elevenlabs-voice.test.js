import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  createTTSJob
} from "../src/ttsProvider.js";

import {
  getElevenLabsProviderStatus,
  generateElevenLabsSpeech
} from "../src/elevenLabsProvider.js";

function hasText(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

test(
  "REAL ELEVENLABS VOICE PRODUCTION TEST",
  async () => {
    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "REAL ELEVENLABS VOICE TEST"
    );
    console.log(
      "========================================"
    );

    const status =
      getElevenLabsProviderStatus();

    console.log(
      "Provider status:",
      status
    );

    assert.ok(
      status,
      "ElevenLabs provider status is unavailable."
    );

    const apiKey =
      process.env.ELEVENLABS_API_KEY;

    const voiceId =
      process.env.ELEVENLABS_VOICE_ID;

    assert.ok(
      hasText(apiKey),
      "ELEVENLABS_API_KEY is missing from .env."
    );

    assert.ok(
      hasText(voiceId),
      "ELEVENLABS_VOICE_ID is missing from .env."
    );

    const outputDir =
      "./storage/test/elevenlabs";

    await fs.mkdir(
      outputDir,
      {
        recursive: true
      }
    );

    const text =
      "This is a real production voice test for the Zeeshan AI Labs YouTube automation system.";

    console.log(
      "Generating real ElevenLabs MP3..."
    );

    const result =
      await generateElevenLabsSpeech({
        text,
        voiceId,
        outputDir
      });

    console.log(
      "ElevenLabs result:",
      result
    );

    assert.ok(
      result,
      "ElevenLabs returned no result."
    );

    assert.equal(
      result.success,
      true,
      `ElevenLabs voice generation failed: ${
        result.error ||
        JSON.stringify(result)
      }`
    );

    assert.ok(
      hasText(result.outputFile),
      "ElevenLabs did not return an output file."
    );

    const outputFile =
      path.resolve(
        result.outputFile
      );

    const stats =
      await fs.stat(
        outputFile
      );

    assert.ok(
      stats.isFile(),
      "Generated voice output is not a file."
    );

    assert.ok(
      stats.size > 0,
      "Generated voice file is empty."
    );

    assert.equal(
      path.extname(
        outputFile
      ).toLowerCase(),
      ".mp3",
      "ElevenLabs output must be an MP3 file."
    );

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "ELEVENLABS REAL VOICE TEST: GREEN"
    );
    console.log(
      "========================================"
    );

    console.log(
      `MP3 file: ${outputFile}`
    );

    console.log(
      `File size: ${stats.size} bytes`
    );

    console.log(
      "Real API request: SUCCESS"
    );

    console.log(
      "Real MP3 generation: SUCCESS"
    );

    console.log(
      "========================================"
    );
  }
);
