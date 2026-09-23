import {
  analyzeSafety,
  enforceSafety
} from "./safetyGuard.js";

import {
  checkDuplicateContent
} from "./duplicateGuard.js";

import {
  canAutoPublish
} from "./ceoControl.js";

export function preparePublication({
  title,
  script,
  description = "",
  previousItems = []
} = {}) {
  const safety = analyzeSafety({
    title,
    script,
    description
  });

  const safetyDecision =
    enforceSafety(safety);

  if (!safetyDecision.allowed) {
    return {
      status: "BLOCKED",
      reason:
        safetyDecision.reason ||
        "Safety policy blocked publication.",
      safety,
      autoPublishAllowed: false,
      createdAt:
        new Date().toISOString()
    };
  }

  const duplicate =
    checkDuplicateContent({
      title: title || "",
      script: script || "",
      existingContent:
        Array.isArray(previousItems)
          ? previousItems
          : []
    });

  if (duplicate?.status === "BLOCK") {
    return {
      status: "BLOCKED",
      reason:
        duplicate.reason ||
        "Duplicate content detected.",
      safety,
      duplicate,
      autoPublishAllowed: false,
      createdAt:
        new Date().toISOString()
    };
  }

  if (duplicate?.status === "REVIEW") {
    return {
      status:
        "CEO_REVIEW_REQUIRED",
      reason:
        duplicate.reason ||
        "Duplicate-content review is required.",
      safety,
      duplicate,
      autoPublishAllowed: false,
      createdAt:
        new Date().toISOString()
    };
  }

  const autoPublishAllowed =
    canAutoPublish(
      safety.level
    );

  return {
    status:
      autoPublishAllowed
        ? "AUTO_PUBLISH_ELIGIBLE"
        : "CEO_REVIEW_REQUIRED",

    safety,

    duplicate,

    autoPublishAllowed,

    createdAt:
      new Date().toISOString()
  };
}