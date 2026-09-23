const HIGH_RISK_PATTERNS = [
  /\b(fake news|fabricated|made up story)\b/i,
  /\bguaranteed money\b/i,
  /\bget rich quick\b/i,
  /\bscam\b/i,
  /\bimpersonat(e|ion)\b/i,
  /\bdeepfake\b/i,
  /\bterrorist\b/i
];

const MEDIUM_RISK_PATTERNS = [
  /\bbreaking\b/i,
  /\bexclusive\b/i,
  /\bshocking\b/i,
  /\bsecret\b/i,
  /\ballegedly\b/i,
  /\bcontroversy\b/i
];

export function analyzeSafety({
  title = "",
  script = "",
  description = ""
} = {}) {
  const text = `${title}\n${script}\n${description}`.trim();

  const reasons = [];

  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push(`High-risk pattern detected: ${pattern}`);
    }
  }

  if (reasons.length > 0) {
    return {
      level: "HIGH",
      approved: false,
      action: "BLOCK",
      reasons
    };
  }

  const mediumReasons = [];

  for (const pattern of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(text)) {
      mediumReasons.push(
        `Review pattern detected: ${pattern}`
      );
    }
  }

  if (mediumReasons.length > 0) {
    return {
      level: "MEDIUM",
      approved: false,
      action: "REVIEW",
      reasons: mediumReasons
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
  if (!result || !result.level) {
    throw new Error("Invalid safety result.");
  }

  if (result.level === "HIGH") {
    return {
      allowed: false,
      reason: "High-risk content blocked."
    };
  }

  if (result.level === "MEDIUM") {
    return {
      allowed: false,
      reason: "Medium-risk content requires CEO review."
    };
  }

  return {
    allowed: true,
    reason: "Low-risk content may continue."
  };
}
