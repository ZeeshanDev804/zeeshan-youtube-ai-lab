const HIGH_RISK_PATTERNS = [
  /\bhow\s+to\s+make\s+a\s+bomb\b/i,
  /\bmake\s+an?\s+explosive\b/i,
  /\bbuild\s+an?\s+explosive\b/i,
  /\bterrorist\s+recruitment\b/i,
  /\bterrorist\s+propaganda\b/i,
  /\bextremist\s+recruitment\b/i,
  /\bmalware\s+download\b/i,
  /\bransomware\s+attack\s+instructions\b/i,
  /\bsteal\s+passwords\b/i,
  /\bstolen\s+passwords\b/i,
  /\bhack\s+someone'?s\s+account\b/i,
  /\bhacking\s+instructions\b/i,
  /\bcredential\s+theft\b/i,
  /\bself[-\s]?harm\s+instructions\b/i,
  /\bsuicide\s+instructions\b/i,
  /\bhow\s+to\s+commit\s+suicide\b/i
];

const REVIEW_PATTERNS = [
  /\bbreaking\s+news\b/i,
  /\bexclusive\b/i,
  /\bshocking\b/i,
  /\ballegedly\b/i,
  /\bdeveloping\s+story\b/i,
  /\bunconfirmed\b/i,
  /\bunverified\b/i,
  /\bcelebrity\s+death\b/i,
  /\bdeath\s+confirmed\b/i,
  /\bmajor\s+breaking\b/i,
  /\bclaims?\s+that\b/i,
  /\breportedly\b/i,
  /\baccording\s+to\s+sources\b/i
];

const SENSITIVE_TOPIC_PATTERNS = [
  /\bwar\b/i,
  /\bterror(?:ism|ist)?\b/i,
  /\battack\b/i,
  /\bshooting\b/i,
  /\bbomb\b/i,
  /\bexplosion\b/i,
  /\bdeath\b/i,
  /\bdead\b/i,
  /\bkilled\b/i,
  /\bmurder\b/i,
  /\bviolence\b/i,
  /\bchild\s+abuse\b/i,
  /\bsexual\s+abuse\b/i,
  /\btrafficking\b/i,
  /\bdrugs?\b/i,
  /\bscam\b/i,
  /\bfraud\b/i,
  /\bcyberattack\b/i,
  /\bhack(?:ing)?\b/i,
  /\bpolitical\s+crisis\b/i,
  /\belection\b/i
];

const MIN_CONTENT_LENGTH = 40;

function normalizeText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function collectMatches(
  patterns,
  text
) {
  return patterns
    .filter((pattern) =>
      pattern.test(text)
    )
    .map((pattern) =>
      pattern.source
    );
}

function getResearchStatus(
  research
) {
  return String(
    research?.result?.status ||
    research?.status ||
    ""
  )
    .trim()
    .toUpperCase();
}

function validateContent({
  title,
  script,
  description
}) {
  const errors = [];

  const cleanTitle =
    normalizeText(title);

  const cleanScript =
    normalizeText(script);

  const cleanDescription =
    normalizeText(description);

  const combinedLength =
    normalizeText(
      `${cleanTitle}\n${cleanScript}\n${cleanDescription}`
    ).length;

  if (!cleanTitle) {
    errors.push(
      "Title is required."
    );
  }

  if (!cleanScript) {
    errors.push(
      "Script is required."
    );
  }

  if (
    combinedLength <
    MIN_CONTENT_LENGTH
  ) {
    errors.push(
      `Content is too short for a reliable safety check. Minimum length is ${MIN_CONTENT_LENGTH} characters.`
    );
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}

export function analyzeSafety({
  title = "",
  script = "",
  description = "",
  research = null
} = {}) {
  const cleanTitle =
    normalizeText(title);

  const cleanScript =
    normalizeText(script);

  const cleanDescription =
    normalizeText(description);

  const text =
    normalizeText(
      `${cleanTitle}\n${cleanScript}\n${cleanDescription}`
    );

  const validation =
    validateContent({
      title:
        cleanTitle,
      script:
        cleanScript,
      description:
        cleanDescription
    });

  if (!validation.valid) {
    return {
      level: "MEDIUM",

      approved: false,

      action: "REVIEW",

      riskScore: 50,

      reasons:
        validation.errors,

      matches: {
        highRisk: [],
        review: [],
        sensitive: []
      },

      researchStatus:
        getResearchStatus(
          research
        ),

      contentValid: false,

      nextStage:
        "CEO_REVIEW"
    };
  }

  const highRiskMatches =
    collectMatches(
      HIGH_RISK_PATTERNS,
      text
    );

  if (
    highRiskMatches.length > 0
  ) {
    return {
      level: "HIGH",

      approved: false,

      action: "BLOCK",

      riskScore: 100,

      reasons: [
        "High-risk content pattern detected."
      ],

      matches: {
        highRisk:
          highRiskMatches,
        review: [],
        sensitive: []
      },

      researchStatus:
        getResearchStatus(
          research
        ),

      contentValid: true,

      nextStage:
        "BLOCKED"
    };
  }

  const reviewMatches =
    collectMatches(
      REVIEW_PATTERNS,
      text
    );

  const sensitiveMatches =
    collectMatches(
      SENSITIVE_TOPIC_PATTERNS,
      text
    );

  const researchStatus =
    getResearchStatus(
      research
    );

  const researchNeedsReview =
    researchStatus ===
      "INSUFFICIENT_RESEARCH" ||
    researchStatus ===
      "RESEARCH_REQUIRED" ||
    researchStatus ===
      "UNVERIFIED" ||
    researchStatus ===
      "REVIEW";

  const researchNotConnected =
    researchStatus ===
      "READY_FOR_RESEARCH_PROVIDER" ||
    researchStatus ===
      "NOT_CONFIGURED" ||
    researchStatus ===
      "NOT_CONNECTED";

  if (
    researchNeedsReview
  ) {
    return {
      level: "MEDIUM",

      approved: false,

      action: "REVIEW",

      riskScore: 65,

      reasons: [
        "Research verification is insufficient."
      ],

      matches: {
        highRisk:
          highRiskMatches,
        review:
          reviewMatches,
        sensitive:
          sensitiveMatches
      },

      researchStatus,

      contentValid: true,

      nextStage:
        "CEO_REVIEW"
    };
  }

  if (
    researchNotConnected
  ) {
    return {
      level: "MEDIUM",

      approved: false,

      action: "REVIEW",

      riskScore: 60,

      reasons: [
        "Live research verification is not connected."
      ],

      matches: {
        highRisk:
          highRiskMatches,
        review:
          reviewMatches,
        sensitive:
          sensitiveMatches
      },

      researchStatus,

      contentValid: true,

      nextStage:
        "CEO_REVIEW"
    };
  }

  if (
    sensitiveMatches.length > 0
  ) {
    return {
      level: "MEDIUM",

      approved: false,

      action: "REVIEW",

      riskScore: 55,

      reasons: [
        "Sensitive topic detected and requires additional review."
      ],

      matches: {
        highRisk:
          highRiskMatches,
        review:
          reviewMatches,
        sensitive:
          sensitiveMatches
      },

      researchStatus,

      contentValid: true,

      nextStage:
        "CEO_REVIEW"
    };
  }

  if (
    reviewMatches.length > 0
  ) {
    return {
      level: "MEDIUM",

      approved: false,

      action: "REVIEW",

      riskScore: 45,

      reasons: [
        "Potentially sensitive or unverified wording detected."
      ],

      matches: {
        highRisk:
          highRiskMatches,
        review:
          reviewMatches,
        sensitive:
          sensitiveMatches
      },

      researchStatus,

      contentValid: true,

      nextStage:
        "CEO_REVIEW"
    };
  }

  return {
    level: "LOW",

    approved: true,

    action: "CONTINUE",

    riskScore: 10,

    reasons: [],

    matches: {
      highRisk: [],
      review: [],
      sensitive: []
    },

    researchStatus,

    contentValid: true,

    nextStage:
      "CONTINUE"
  };
}

export function enforceSafety(
  result
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    return {
      allowed: false,

      action: "BLOCK",

      reason:
        "Invalid safety result."
    };
  }

  const level =
    String(
      result.level || ""
    )
      .trim()
      .toUpperCase();

  if (
    level === "HIGH"
  ) {
    return {
      allowed: false,

      action: "BLOCK",

      reason:
        "High-risk content must not continue."
    };
  }

  if (
    level === "MEDIUM"
  ) {
    return {
      allowed: false,

      action: "REVIEW",

      reason:
        "Content requires CEO/human review before production or publishing."
    };
  }

  if (
    level === "LOW" &&
    result.approved === true
  ) {
    return {
      allowed: true,

      action: "CONTINUE",

      reason:
        "Content passed the current safety checks."
    };
  }

  return {
    allowed: false,

    action: "BLOCK",

    reason:
      "Safety result could not be verified."
  };
}

export function getSafetyGuardStatus() {
  return {
    configured: true,

    status: "READY",

    decisions: [
      "LOW → CONTINUE",
      "MEDIUM → REVIEW",
      "HIGH → BLOCK"
    ],

    checks: [
      "high-risk content patterns",
      "sensitive topics",
      "unverified claims",
      "research verification status",
      "minimum content validation",
      "invalid safety-result blocking"
    ],

    message:
      "Safety Guard blocks high-risk content and routes medium-risk or insufficiently verified content to review."
  };
}

export default {
  analyzeSafety,
  enforceSafety,
  getSafetyGuardStatus
};