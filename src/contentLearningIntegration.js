import {
  createSupportingContentBatch
} from "./supportingContentEngine.js";

import {
  recordVideoPerformance,
  generateLearningReport,
  getBestPerformingVideos
} from "./analyticsLearningEngine.js";

export function prepareSupportingContent({
  topic,
  existingContent = []
} = {}) {
  if (!topic) {
    return {
      success: false,
      status: "TOPIC_REQUIRED"
    };
  }

  return createSupportingContentBatch({
    topic,
    existingContent
  });
}

export function recordPublishedVideoPerformance(
  metrics = {}
) {
  return recordVideoPerformance(metrics);
}

export function getContentLearningReport() {
  return generateLearningReport();
}

export function getTopPerformingContent(limit = 5) {
  return getBestPerformingVideos(limit);
}

export function getContentLearningIntegrationStatus() {
  return {
    configured: true,
    status: "READY",
    modules: {
      supportingContent: true,
      analytics: true,
      learning: true
    },
    workflow: [
      "TOPIC",
      "SUPPORTING_CONTENT",
      "VIDEO",
      "PUBLISH",
      "ANALYTICS",
      "LEARNING"
    ]
  };
}

export default {
  prepareSupportingContent,
  recordPublishedVideoPerformance,
  getContentLearningReport,
  getTopPerformingContent,
  getContentLearningIntegrationStatus
};
