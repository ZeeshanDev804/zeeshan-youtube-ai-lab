import config from "./config.js";

export function validateVideoSpecification(spec = {}) {
  const width = Number(spec.width || config.video.width);
  const height = Number(spec.height || config.video.height);
  const fps = Number(spec.fps || config.video.fps);
  const duration = Number(spec.durationSeconds || 0);

  const errors = [];

  if (width !== 1080 || height !== 1920) {
    errors.push("Shorts output must use 1080x1920.");
  }

  if (fps <= 0) {
    errors.push("FPS must be greater than zero.");
  }

  if (
    duration < config.video.minSeconds ||
    duration > config.video.maxSeconds
  ) {
    errors.push(
      `Duration must be between ${config.video.minSeconds} and ${config.video.maxSeconds} seconds.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    specification: {
      width,
      height,
      fps,
      duration
    }
  };
}

export function createVideoJob({
  topic,
  script,
  voiceFile = null,
  visualAssets = []
} = {}) {
  if (!topic) {
    throw new Error("Video job requires a topic.");
  }

  if (!script) {
    throw new Error("Video job requires a script.");
  }

  return {
    id: `video_${Date.now()}`,
    status: "READY_FOR_RENDER",
    createdAt: new Date().toISOString(),

    format: {
      width: config.video.width,
      height: config.video.height,
      fps: config.video.fps
    },

    topic,
    script,
    voiceFile,
    visualAssets
  };
}
