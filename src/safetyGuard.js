const HIGH_RISK_PATTERNS = [
  /\bhow to make a bomb\b/i,
  /\bmake an explosive\b/i,
  /\bterrorist recruitment\b/i,
  /\bterrorist propaganda\b/i,
  /\bmalware download\b/i,
  /\bransomware attack instructions\b/i,
  /\bsteal passwords\b/i,
  /\bhack someone's account\b/i,
  /\bself harm instructions\b/i
];

const REVIEW_PATTERNS = [
  /\bbreaking news\b/i,
  /\bexclusive\b/i,
  /\bshocking\b/i,
  /\ballegedly\b/i,
  /\bdeveloping story\b/i,
  /\bunconfirmed\b/i,
  /\bcelebrity death\b/i
];

function normalizeText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

export function analyzeSafety({
  title = "",
  script = "",
  description = "",
  research = null
} = {}) {
  const text = normalizeText(
    `${title}\n${script}\n${description}`
  );

  const highRiskMatches =
    HIGH_RISK_PATTERNS.filter(
      (pattern) => pattern.test(text)
    );

  if (highRiskMatches.length > 0) {
    return {
      level: "HIGH",
      approved: false,
      action: "BLOCK",
      reasons: [
        "High-risk content pattern detected."
      ]
    };
  }

  const reviewMatches =
    REVIEW_PATTERNS.filter(
      (pattern) => pattern.test(text)
    );

  if (
    reviewMatches.length > 0 ||
    research?.result?.status ===
      "INSUFFICIENT_RESEARCH"
  ) {
    return {
      level: "MEDIUM",
      approved: false,
      action: "REVIEW",
      reasons: [
        "Additional human/CEO review is required."
      ]
    };
  }

  if (
    research?.result?.status ===
    "READY_FOR_RESEARCH_PROVIDER"
  ) {
    return {
      level: "MEDIUM",
      approved: false,
      action: "REVIEW",
      reasons: [
        "Live research verification is not connected yet."
      ]
    };
  }

  return {
    level: "LOW",
    approved: true,
    action: "CONTINUE",
    reasons: []
  };
}

export function enforceSafety(result) {
  if (!result?.level) {
    throw new Error(
      "Invalid safety result."
    );
  }

  if (result.level === "HIGH") {
    return {
      allowed: false,
      action: "BLOCK",
      reason:
        "High-risk content must not continue."
    };
  }

  if (result.level === "MEDIUM") {
    return {
      allowed: false,
      action: "REVIEW",
      reason:
        "Content requires review before publishing."
    };
  }

  return {
    allowed: true,
    action: "CONTINUE",
    reason:
      "Content passed the current safety checks."
  };
}