import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync =
  promisify(execFile);

const FINAL_DIR =
  "./storage/test-final";

async function findLatestMp4() {
  const absoluteDir =
    path.resolve(FINAL_DIR);

  const files =
    await fs.readdir(
      absoluteDir
    );

  const mp4Files =
    files.filter(
      (file) =>
        file.toLowerCase().endsWith(".mp4")
    );

  if (mp4Files.length === 0) {
    return null;
  }

  const withStats =
    await Promise.all(
      mp4Files.map(
        async (file) => {
          const fullPath =
            path.join(
              absoluteDir,
              file
            );

          const stats =
            await fs.stat(fullPath);

          return {
            file,
            fullPath,
            mtime:
              stats.mtimeMs,
            size:
              stats.size
          };
        }
      )
    );

  withStats.sort(
    (a, b) =>
      b.mtime - a.mtime
  );

  return withStats[0];
}

async function runFFprobe(file) {
  const { stdout } =
    await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file
      ]
    );

  return JSON.parse(stdout);
}

console.log("");
console.log(
  "========================================"
);
console.log(
  " ZEESHAN AI LABS"
);
console.log(
  " FINAL SHORT QUALITY ASSURANCE"
);
console.log(
  "========================================"
);
console.log("");

try {
  const video =
    await findLatestMp4();

  if (!video) {
    throw new Error(
      `No MP4 found in ${FINAL_DIR}`
    );
  }

  console.log(
    "Checking:",
    video.fullPath
  );

  console.log(
    "File size:",
    video.size,
    "bytes"
  );

  if (video.size <= 0) {
    throw new Error(
      "Final MP4 is empty."
    );
  }

  const probe =
    await runFFprobe(
      video.fullPath
    );

  const streams =
    Array.isArray(
      probe.streams
    )
      ? probe.streams
      : [];

  const videoStream =
    streams.find(
      (stream) =>
        stream.codec_type ===
        "video"
    );

  const audioStream =
    streams.find(
      (stream) =>
        stream.codec_type ===
        "audio"
    );

  if (!videoStream) {
    throw new Error(
      "Video stream is missing."
    );
  }

  if (!audioStream) {
    throw new Error(
      "Audio stream is missing."
    );
  }

  const width =
    Number(
      videoStream.width
    );

  const height =
    Number(
      videoStream.height
    );

  console.log(
    "Resolution:",
    `${width}x${height}`
  );

  if (
    width !== 1080 ||
    height !== 1920
  ) {
    throw new Error(
      `Invalid Shorts resolution: ${width}x${height}`
    );
  }

  const duration =
    Number(
      probe.format?.duration ||
      videoStream.duration ||
      0
    );

  console.log(
    "Duration:",
    `${duration.toFixed(2)} seconds`
  );

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new Error(
      "Invalid video duration."
    );
  }

  const videoCodec =
    videoStream.codec_name ||
    "unknown";

  const audioCodec =
    audioStream.codec_name ||
    "unknown";

  console.log(
    "Video codec:",
    videoCodec
  );

  console.log(
    "Audio codec:",
    audioCodec
  );

  if (
    !videoStream.codec_name
  ) {
    throw new Error(
      "Video codec information is missing."
    );
  }

  if (
    !audioStream.codec_name
  ) {
    throw new Error(
      "Audio codec information is missing."
    );
  }

  if (
    !probe.format?.format_name
  ) {
    throw new Error(
      "Container format information is missing."
    );
  }

  console.log(
    "Container:",
    probe.format.format_name
  );

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    " ✅ FINAL QA PASSED"
  );
  console.log(
    "========================================"
  );

  console.log("");
  console.log(
    "Final MP4:",
    video.fullPath
  );

  console.log(
    "Video:",
    `${width}x${height}`
  );

  console.log(
    "Audio:",
    audioCodec
  );

  console.log(
    "Duration:",
    `${duration.toFixed(2)}s`
  );

  console.log("");
  console.log(
    "NEXT STAGE:"
  );

  console.log(
    "YouTube OAuth + Private Upload"
  );

} catch (error) {
  console.error("");
  console.error(
    "========================================"
  );
  console.error(
    " ❌ FINAL QA FAILED"
  );
  console.error(
    "========================================"
  );

  console.error("");
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exit(1);
}
