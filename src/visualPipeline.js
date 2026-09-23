import {
  createVisualJob,
  verifyVisualLicense
} from "./visualProvider.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createVisualPrompt({
  topic,
  scene,
  style = "modern documentary"
} = {}) {
  const cleanTopic = cleanText(topic);
  const cleanScene = cleanText(scene);

  return [
    style,
    "vertical YouTube Shorts visual",
    "9:16 composition",
    "high quality",
    "clean professional composition",
    "no logos",
    "no watermarks",
    cleanTopic,
    cleanScene
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildVisualPlan({
  topic,
  scenes = [],
  provider = "not_configured"
} = {}) {
  const cleanTopic = cleanText(topic);

  if (!cleanTopic) {
    return {
      success: false,
      status: "INVALID",
      errors: ["Topic is required."]
    };
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return {
      success: false,
      status: "INVALID",
      errors: ["At least one visual scene is required."]
    };
  }

  const jobs = scenes
    .map((scene, index) => {
      const prompt = createVisualPrompt({
        topic: cleanTopic,
        scene:
          typeof scene === "string"
            ? scene
            : scene?.description || "",
        style:
          typeof scene === "object"
            ? scene?.style || "modern documentary"
            : "modern documentary"
      });

      return createVisualJob({
        prompt,
        provider
      });
    });

  const invalidJobs = jobs.filter(
    (job) => !job.success
  );

  if (invalidJobs.length > 0) {
    return {
      success: false,
      status: "INVALID",
      errors: invalidJobs.flatMap(
        (job) => job.errors || []
      )
    };
  }

  return {
    success: true,
    status: "READY_FOR_GENERATION",
    topic: cleanTopic,
    provider,
    sceneCount: jobs.length,
    jobs
  };
}

export function validateVisualProduction({
  source,
  license,
  licenseVerified = false,
  generatedByAI = false
} = {}) {
  if (generatedByAI === true) {
    return {
      valid: true,
      status: "PASS",
      generatedByAI: true,
      licenseVerified: true,
      message:
        "AI-generated visual does not require an external stock-source license record."
    };
  }

  const licenseCheck =
    verifyVisualLicense({
      source,
      license,
      licenseVerified
    });

  return {
    valid: licenseCheck.verified,
    status: licenseCheck.status,
    generatedByAI: false,
    licenseVerified:
      licenseCheck.verified,
    reason:
      licenseCheck.reason || null
  };
}

export function createShortVisualTimeline({
  scenes = [],
  totalDurationSeconds = 30
} = {}) {
  if (
    !Array.isArray(scenes) ||
    scenes.length === 0
  ) {
    return {
      success: false,
      status: "INVALID",
      errors: ["Visual scenes are required."]
    };
  }

  const duration =
    Number(totalDurationSeconds);

  if (
    !Number.isFinite(duration) ||
    duration < 1
  ) {
    return {
      success: false,
      status: "INVALID",
      errors: [
        "Valid total duration is required."
      ]
    };
  }

  const sceneDuration =
    duration / scenes.length;

  const timeline = scenes.map(
    (scene, index) => ({
      index: index + 1,
      description:
        typeof scene === "string"
          ? cleanText(scene)
          : cleanText(
              scene?.description || ""
            ),
      start:
        Number(
          (index * sceneDuration).toFixed(2)
        ),
      end:
        Number(
          ((index + 1) * sceneDuration).toFixed(2)
        ),
      duration:
        Number(
          sceneDuration.toFixed(2)
        )
    })
  );

  return {
    success: true,
    status: "READY",
    totalDurationSeconds: duration,
    sceneCount: timeline.length,
    timeline
  };
}

export function getVisualPipelineStatus() {
  return {
    configured: true,
    status: "READY",
    capabilities: [
      "visual prompt generation",
      "scene planning",
      "visual timeline",
      "AI visual license handling",
      "stock visual license validation",
      "provider-ready visual jobs"
    ],
    message:
      "Visual production pipeline is ready for the final image provider."
  };
}
