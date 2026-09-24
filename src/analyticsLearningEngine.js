import {
  analyzeVideoPerformance,
  createLearningReport
} from "./analyticsBrain.js";

const MAX_HISTORY = 500;

const performanceHistory = [];

export function recordVideoPerformance(metrics = {}) {
  const analysis = analyzeVideoPerformance(metrics);

  performanceHistory.push({
    videoId: metrics.videoId || null,
    topic: metrics.topic || null,
    title: metrics.title || null,
    ...analysis
  });

  if (performanceHistory.length > MAX_HISTORY) {
    performanceHistory.shift();
  }

  return {
    success: true,
    status: "RECORDED",
    analysis
  };
}

export function getPerformanceHistory() {
  return [...performanceHistory];
}

export function generateLearningReport() {
  const report = createLearningReport(
    performanceHistory
  );

  return {
    success: true,
    status:
      performanceHistory.length > 0
        ? "READY"
        : "WAITING_FOR_DATA",
    ...report
  };
}

export function getBestPerformingVideos(limit = 5) {
  return [...performanceHistory]
    .sort(
      (a, b) =>
        Number(b.views || 0) -
        Number(a.views || 0)
    )
    .slice(0, Math.max(1, Number(limit) || 5));
}

export function getAnalyticsLearningStatus() {
  return {
    configured: true,
    status: "READY",
    recordedVideos: performanceHistory.length,
    maxHistory: MAX_HISTORY,
    features: [
      "performance-recording",
      "engagement-analysis",
      "retention-signals",
      "traffic-source-signals",
      "learning-report",
      "best-video-detection"
    ]
  };
}

export default {
  recordVideoPerformance,
  getPerformanceHistory,
  generateLearningReport,
  getBestPerformingVideos,
  getAnalyticsLearningStatus
};
