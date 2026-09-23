import { analyzeSafety, enforceSafety } from "./safetyGuard.js";
import { isDuplicate } from "./duplicateGuard.js";
import { canAutoPublish } from "./ceoControl.js";

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

  const safetyDecision = enforceSafety(safety);

  if (!safetyDecision.allowed) {
    return {
      status: "BLOCKED",
      reason: safetyDecision.reason,
      safety
    };
  }

  const duplicate = isDuplicate({
    title,
    script,
    previousItems
  });

  if (duplicate.duplicate) {
    return {
      status: "BLOCKED",
      reason: duplicate.reason,
      duplicate
    };
  }

  const autoPublishAllowed = canAutoPublish(
    safety.level
  );

  return {
    status: autoPublishAllowed
      ? "AUTO_PUBLISH_ELIGIBLE"
      : "CEO_REVIEW_REQUIRED",

    safety,
    duplicate,
    autoPublishAllowed,
    createdAt: new Date().toISOString()
  };
}
