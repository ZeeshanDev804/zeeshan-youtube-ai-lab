export function analyzeVideoPerformance(metrics = {}) {
  const views = Number(metrics.views || 0);
  const likes = Number(metrics.likes || 0);
  const comments = Number(metrics.comments || 0);
  const subscribersGained = Number(
    metrics.subscribersGained || 0
  );

  const engagementRate =
    views > 0
      ? ((likes + comments) / views) * 100
      : 0;

  return {
    views,
    likes,
    comments,
    subscribersGained,

    engagementRate:
      Math.round(engagementRate * 100) / 100,

    learningSignals: {
      hook: metrics.hookScore ?? null,
      retention: metrics.retention ?? null,
      averageViewDuration:
        metrics.averageViewDuration ?? null,
      trafficSource:
        metrics.trafficSource ?? null
    },

    analyzedAt: new Date().toISOString()
  };
}

export function createLearningReport(videos = []) {
  return {
    videoCount: videos.length,
    analyzedAt: new Date().toISOString(),
    recommendations: [
      "Measure retention before changing the video style.",
      "Compare different hooks using real performance data.",
      "Avoid repeating weak topics.",
      "Keep successful formats original rather than copying them."
    ]
  };
}
