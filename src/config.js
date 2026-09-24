system: {
  mode: process.env.SYSTEM_MODE || "REVIEW",

  dailyTargetVideos: Math.max(
    1,
    toNumber(process.env.DAILY_TARGET_VIDEOS, 5)
  ),

  // No hard daily maximum.
  maxDailyVideos: null,
  hardDailyMaximum: false,

  ceoApprovalRequired: toBoolean(
    process.env.CEO_APPROVAL_REQUIRED,
    true
  ),

  emergencyStop: toBoolean(
    process.env.EMERGENCY_STOP,
    false
  )
},