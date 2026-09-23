import {
  buildVisualPlan,
  createShortVisualTimeline
} from "./visualPipeline.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function splitScriptIntoScenes(
  script = "",
  maxScenes = 6
) {
  const text = cleanText(script);

  if (!text) {
    return [];
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return [text];
  }

  const sceneCount = Math.min(
    maxScenes,
    sentences.length
  );

  const scenes = [];

  for (let i = 0; i < sceneCount; i += 1) {
    const start = Math.floor(
      (i * sentences.length) /
        sceneCount
    );

    const end = Math.floor(
      ((i + 1) * sentences.length) /
        sceneCount
    );

    const sceneText = sentences
      .slice(start, end)
      .join(" ");

    if (sceneText) {
      scenes.push(sceneText);
    }
  }

  return scenes;
}

function buildSceneDescription({
  topic,
  scene,
  index
}) {
  const cleanTopic = cleanText(topic);
  const cleanScene = cleanText(scene);

  const sceneTypes = [
    "strong opening visual",
    "main subject visual",
    "supporting factual visual",
    "context visual",
    "important detail visual",
    "closing visual"
  ];

  const sceneType =
    sceneTypes[
      Math.min(
        index,
        sceneTypes.length - 1
      )
    ];

  return {
    description:
      `${sceneType} about ${cleanTopic}. Visual context: ${cleanScene}`,
    style:
      "professional modern documentary"
  };
}

export function createShortVisualPlan({
  topic,
  script,
  totalDurationSeconds = 30,
  provider = "not_configured",
  maxScenes = 6
} = {}) {
  const cleanTopic = cleanText(topic);
  const cleanScript = cleanText(script);

  if (!cleanTopic) {
    return {
      success: false,
      status: "INVALID",
      errors: [
        "Topic is required."
      ]
    };
  }

  if (!cleanScript) {
    return {
      success: false,
      status: "INVALID",
      errors: [
        "Script is required."
      ]
    };
  }

  const rawScenes =
    splitScriptIntoScenes(
      cleanScript,
      maxScenes
    );

  if (rawScenes.length === 0) {
    return {
      success: false,
      status: "INVALID",
      errors: [
        "No visual scenes could be created."
      ]
    };
  }

  const scenes = rawScenes.map(
    (scene, index) =>
      buildSceneDescription({
        topic: cleanTopic,
        scene,
        index
      })
  );

  const visualPlan =
    buildVisualPlan({
      topic: cleanTopic,
      scenes,
      provider
    });

  if (!visualPlan.success) {
    return visualPlan;
  }

  const timeline =
    createShortVisualTimeline({
      scenes,
      totalDurationSeconds
    });

  if (!timeline.success) {
    return timeline;
  }

  return {
    success: true,
    status: "READY_FOR_VISUAL_GENERATION",
    topic: cleanTopic,
    sceneCount: scenes.length,
    provider,
    scenes,
    visualJobs:
      visualPlan.jobs,
    timeline:
      timeline.timeline,
    totalDurationSeconds:
      timeline.totalDurationSeconds
  };
}

export function getShortVisualPlannerStatus() {
  return {
    configured: true,
    status: "READY",
    capabilities: [
      "script-to-scenes",
      "topic-aware visual prompts",
      "automatic scene timing",
      "visual provider jobs",
      "Shorts timeline planning"
    ],
    message:
      "Short visual planner is ready."
  };
}
