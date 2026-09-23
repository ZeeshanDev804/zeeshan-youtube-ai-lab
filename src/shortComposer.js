import crypto from "node:crypto";

const MIN_DURATION = 20;
const MAX_DURATION = 59;

function cleanText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function createId(prefix) {
  return `${prefix}_${crypto
    .randomBytes(8)
    .toString("hex")}`;
}

function validateScript(script) {
  if (
    !script ||
    typeof script !== "object"
  ) {
    return {
      valid: false,
      errors: [
        "Script object is required."
      ]
    };
  }

  const errors = [];

  if (
    !cleanText(script.title)
  ) {
    errors.push(
      "Script title is required."
    );
  }

  if (
    !cleanText(script.script)
  ) {
    errors.push(
      "Script text is required."
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateVoice(voice) {
  if (
    !voice ||
    typeof voice !== "object"
  ) {
    return {
      valid: false,
      errors: [
        "Voice plan is required."
      ]
    };
  }

  if (
    voice.status ===
    "READY_FOR_TTS_PROVIDER"
  ) {
    return {
      valid: false,
      errors: [
        "Real TTS audio is not connected yet."
      ]
    };
  }

  return {
    valid: true,
    errors: []
  };
}

function validateVisuals(visuals) {
  if (
    !Array.isArray(visuals)
  ) {
    return {
      valid: false,
      errors: [
        "Visual assets must be an array."
      ]
    };
  }

  const errors = [];

  for (const asset of visuals) {
    if (
      !asset ||
      typeof asset !== "object"
    ) {
      errors.push(
        "Invalid visual asset."
      );
      continue;
    }

    if (
      asset.licenseVerified !== true
    ) {
      errors.push(
        "Every visual asset must have verified licensing."
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function estimateDurationFromScript(
  text,
  wordsPerMinute = 150
) {
  const words =
    cleanText(text)
      .split(" ")
      .filter(Boolean)
      .length;

  if (words === 0) {
    return 0;
  }

  const seconds =
    (words /
      Number(wordsPerMinute)) *
    60;

  return Number(
    seconds.toFixed(2)
  );
}

export function createShortProductionPlan({
  script,
  voice,
  visuals = [],
  safety = null,
  copyright = null,
  duplicate = null
} = {}) {
  const errors = [];

  const scriptCheck =
    validateScript(script);

  if (!scriptCheck.valid) {
    errors.push(
      ...scriptCheck.errors
    );
  }

  const voiceCheck =
    validateVoice(voice);

  if (!voiceCheck.valid) {
    errors.push(
      ...voiceCheck.errors
    );
  }

  const visualCheck =
    validateVisuals(visuals);

  if (!visualCheck.valid) {
    errors.push(
      ...visualCheck.errors
    );
  }

  if (
    safety &&
    safety.status === "BLOCK"
  ) {
    errors.push(
      "Safety system blocked this content."
    );
  }

  if (
    copyright &&
    copyright.status === "REVIEW"
  ) {
    errors.push(
      "Copyright review is required."
    );
  }

  if (
    duplicate &&
    (
      duplicate.status === "BLOCK" ||
      duplicate.status === "REVIEW"
    )
  ) {
    errors.push(
      "Duplicate-content review is required."
    );
  }

  const estimatedDuration =
    estimateDurationFromScript(
      script?.script || ""
    );

  if (
    estimatedDuration < MIN_DURATION ||
    estimatedDuration > MAX_DURATION
  ) {
    errors.push(
      `Estimated duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds.`
    );
  }

  const ready =
    errors.length === 0;

  return {
    id: createId("short"),
    status: ready
      ? "READY_FOR_RENDER"
      : "REVIEW_REQUIRED",

    ready,

    title:
      cleanText(
        script?.title || ""
      ),

    category:
      cleanText(
        script?.category || ""
      ),

    language: "en",

    estimatedDuration,

    script: {
      title:
        cleanText(
          script?.title || ""
        ),
      hook:
        cleanText(
          script?.hook || ""
        ),
      body:
        cleanText(
          script?.script || ""
        ),
      description:
        cleanText(
          script?.description || ""
        ),
      hashtags:
        Array.isArray(
          script?.hashtags
        )
          ? script.hashtags
          : []
    },

    voice: voice || null,

    visuals,

    checks: {
      safety:
        safety || null,
      copyright:
        copyright || null,
      duplicate:
        duplicate || null
    },

    errors,

    createdAt:
      new Date().toISOString()
  };
}

export function canRenderShort(plan) {
  if (
    !plan ||
    typeof plan !== "object"
  ) {
    return {
      allowed: false,
      reason:
        "Production plan is missing."
    };
  }

  if (
    plan.status !==
    "READY_FOR_RENDER"
  ) {
    return {
      allowed: false,
      reason:
        "Production plan is not ready for rendering.",
      errors:
        plan.errors || []
    };
  }

  return {
    allowed: true,
    reason:
      "Short is ready for rendering."
  };
}

export function createRenderManifest(
  plan
) {
  const renderCheck =
    canRenderShort(plan);

  if (!renderCheck.allowed) {
    return {
      ready: false,
      status: "BLOCKED",
      reason:
        renderCheck.reason,
      errors:
        renderCheck.errors || []
    };
  }

  return {
    ready: true,
    status: "READY",
    id: createId("render"),
    title: plan.title,
    durationSeconds:
      plan.estimatedDuration,
    width: 1080,
    height: 1920,
    fps: 30,
    format: "mp4",
    voice: plan.voice,
    visuals: plan.visuals,
    createdAt:
      new Date().toISOString()
  };
}
