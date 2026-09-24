import crypto from "node:crypto";

const MIN_TEXT_LENGTH = 80;
const NGRAM_SIZE = 5;

const REVIEW_OVERLAP_RATIO = 0.12;
const BLOCK_OVERLAP_RATIO = 0.30;

const MAX_MATCHED_PHRASES = 12;

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getWords(text = "") {
  return normalizeText(text)
    .split(" ")
    .filter(Boolean);
}

function getNgrams(
  words = [],
  size = NGRAM_SIZE
) {
  const result = [];

  if (
    !Array.isArray(words) ||
    words.length < size
  ) {
    return result;
  }

  for (
    let index = 0;
    index <= words.length - size;
    index += 1
  ) {
    result.push(
      words
        .slice(index, index + size)
        .join(" ")
    );
  }

  return result;
}

function hashText(text = "") {
  return crypto
    .createHash("sha256")
    .update(
      normalizeText(text),
      "utf8"
    )
    .digest("hex");
}

function calculatePhraseOverlap(
  originalText = "",
  sourceText = ""
) {
  const originalWords =
    getWords(originalText);

  const sourceWords =
    getWords(sourceText);

  if (
    originalWords.length < 5 ||
    sourceWords.length < 5
  ) {
    return {
      checked: false,
      matchCount: 0,
      overlapRatio: 0,
      matchedPhrases: []
    };
  }

  if (
    originalWords.length < 16 ||
    sourceWords.length < 16
  ) {
    return {
      checked: false,
      matchCount: 0,
      overlapRatio: 0,
      matchedPhrases: []
    };
  }

  const sourceNgrams =
    new Set(
      getNgrams(
        sourceWords,
        NGRAM_SIZE
      )
    );

  const originalNgrams =
    getNgrams(
      originalWords,
      NGRAM_SIZE
    );

  if (
    originalNgrams.length === 0
  ) {
    return {
      checked: false,
      matchCount: 0,
      overlapRatio: 0,
      matchedPhrases: []
    };
  }

  const matchedPhrases = [];

  for (
    const phrase of originalNgrams
  ) {
    if (
      sourceNgrams.has(phrase)
    ) {
      matchedPhrases.push(
        phrase
      );

      if (
        matchedPhrases.length >=
        MAX_MATCHED_PHRASES
      ) {
        break;
      }
    }
  }

  const overlapRatio =
    matchedPhrases.length /
    originalNgrams.length;

  return {
    checked: true,

    matchCount:
      matchedPhrases.length,

    overlapRatio:
      Number(
        overlapRatio.toFixed(4)
      ),

    matchedPhrases
  };
}

function checkSourceAttribution(
  sources = []
) {
  if (
    !Array.isArray(sources)
  ) {
    return {
      passed: false,
      reason:
        "Sources must be an array.",
      sourceCount: 0
    };
  }

  if (
    sources.length === 0
  ) {
    return {
      passed: false,
      reason:
        "No sources supplied.",
      sourceCount: 0
    };
  }

  const validSources =
    sources.filter(
      (source) =>
        source &&
        typeof source ===
          "object" &&
        typeof source.url ===
          "string" &&
        source.url.trim()
          .length > 0
    );

  if (
    validSources.length === 0
  ) {
    return {
      passed: false,
      reason:
        "No valid source URLs supplied.",
      sourceCount: 0
    };
  }

  return {
    passed: true,
    sourceCount:
      validSources.length
  };
}

function checkScriptAgainstSources(
  script = "",
  sources = []
) {
  const findings = [];

  if (
    !Array.isArray(sources)
  ) {
    return findings;
  }

  for (
    const source of sources
  ) {
    if (
      !source ||
      typeof source.text !==
        "string"
    ) {
      continue;
    }

    const result =
      calculatePhraseOverlap(
        script,
        source.text
      );

    if (
      !result.checked
    ) {
      continue;
    }

    if (
      result.matchCount > 0
    ) {
      findings.push({
        sourceUrl:
          source.url ||
          null,

        matchCount:
          result.matchCount,

        overlapRatio:
          result.overlapRatio,

        matchedPhrases:
          result.matchedPhrases
      });
    }
  }

  return findings;
}

function getHighestOverlap(
  findings = []
) {
  if (
    !Array.isArray(findings) ||
    findings.length === 0
  ) {
    return 0;
  }

  return Math.max(
    ...findings.map(
      (finding) =>
        Number(
          finding?.overlapRatio
        ) || 0
    )
  );
}

function checkLicensing(
  metadata = {}
) {
  const visuals =
    Array.isArray(
      metadata.visuals
    )
      ? metadata.visuals
      : [];

  const audio =
    Array.isArray(
      metadata.audio
    )
      ? metadata.audio
      : [];

  const unverifiedVisuals =
    visuals.filter(
      (item) =>
        !item ||
        item.licenseVerified !==
          true
    );

  const unverifiedAudio =
    audio.filter(
      (item) =>
        !item ||
        item.licenseVerified !==
          true
    );

  return {
    visualsChecked:
      visuals.length,

    audioChecked:
      audio.length,

    unverifiedVisuals:
      unverifiedVisuals.length,

    unverifiedAudio:
      unverifiedAudio.length,

    passed:
      unverifiedVisuals.length ===
        0 &&
      unverifiedAudio.length ===
        0
  };
}

function determineCopyrightRisk({
  sourcePassed,
  sourceFindings,
  licensing
} = {}) {
  const highestOverlap =
    getHighestOverlap(
      sourceFindings
    );

  const hasSourceOverlap =
    sourceFindings.length > 0;

  const hasLicenseIssue =
    licensing?.passed !== true;

  if (
    highestOverlap >=
    BLOCK_OVERLAP_RATIO
  ) {
    return {
      level: "HIGH",
      status: "BLOCK",
      reason:
        "High source-text overlap detected."
    };
  }

  if (
    highestOverlap >=
      REVIEW_OVERLAP_RATIO ||
    hasLicenseIssue
  ) {
    return {
      level: "MEDIUM",
      status: "REVIEW",
      reason:
        hasLicenseIssue
          ? "Media licensing could not be fully verified."
          : "Potential source-text overlap requires review."
    };
  }

  if (
    hasSourceOverlap ||
    !sourcePassed
  ) {
    return {
      level: "LOW",
      status: "REVIEW",
      reason:
        !sourcePassed
          ? "Source attribution is incomplete."
          : "Minor source similarity detected."
    };
  }

  return {
    level: "LOW",
    status: "PASS",
    reason:
      "Copyright pre-check passed."
  };
}

export function checkCopyrightSafety({
  title = "",
  script = "",
  sources = [],
  metadata = {}
} = {}) {
  const cleanTitle =
    String(title).trim();

  const cleanScript =
    String(script).trim();

  const combinedText =
    `${cleanTitle}\n${cleanScript}`
      .trim();

  if (
    normalizeText(
      combinedText
    ).length <
    MIN_TEXT_LENGTH
  ) {
    return {
      status: "REVIEW",
      safe: false,
      riskLevel: "MEDIUM",

      contentHash:
        hashText(
          combinedText
        ),

      sourceCheck: {
        passed: false,
        reason:
          "Content is too short for a reliable copyright originality check.",
        sourceCount:
          Array.isArray(sources)
            ? sources.length
            : 0
      },

      sourceFindings: [],

      licensing:
        checkLicensing(
          metadata
        ),

      warnings: [
        "Content is too short for a reliable originality comparison."
      ],

      note:
        "This is an internal originality and licensing pre-check, not a legal copyright guarantee."
    };
  }

  const sourceCheck =
    checkSourceAttribution(
      sources
    );

  const sourceFindings =
    checkScriptAgainstSources(
      combinedText,
      sources
    );

  const licensing =
    checkLicensing(
      metadata
    );

  const decision =
    determineCopyrightRisk({
      sourcePassed:
        sourceCheck.passed,

      sourceFindings,

      licensing
    });

  const warnings = [];

  if (
    !sourceCheck.passed
  ) {
    warnings.push(
      sourceCheck.reason
    );
  }

  if (
    sourceFindings.length > 0
  ) {
    warnings.push(
      "Potential source-text overlap detected."
    );
  }

  if (
    !licensing.passed
  ) {
    warnings.push(
      "One or more media assets do not have verified licensing metadata."
    );
  }

  return {
    status:
      decision.status,

    safe:
      decision.status ===
      "PASS",

    riskLevel:
      decision.level,

    reason:
      decision.reason,

    contentHash:
      hashText(
        combinedText
      ),

    sourceCheck,

    sourceFindings,

    highestOverlapRatio:
      getHighestOverlap(
        sourceFindings
      ),

    licensing,

    warnings,

    thresholds: {
      reviewOverlapRatio:
        REVIEW_OVERLAP_RATIO,

      blockOverlapRatio:
        BLOCK_OVERLAP_RATIO
    },

    note:
      "This is an internal originality and licensing pre-check, not a legal copyright guarantee."
  };
}

export function createCopyrightReviewRequest({
  title = "",
  script = "",
  sources = [],
  metadata = {}
} = {}) {
  const result =
    checkCopyrightSafety({
      title,
      script,
      sources,
      metadata
    });

  return {
    requiresCEOReview:
      result.status ===
        "REVIEW" ||
      result.status ===
        "BLOCK",

    blocked:
      result.status ===
      "BLOCK",

    reason:
      result.reason ||
      (
        result.safe
          ? "Copyright pre-check passed."
          : "Copyright/originality review required."
      ),

    result
  };
}

export function getContentFingerprint(
  title = "",
  script = ""
) {
  return hashText(
    `${title}\n${script}`
  );
}

export function getCopyrightGuardStatus() {
  return {
    configured: true,

    status: "READY",

    decisions: [
      "PASS",
      "REVIEW",
      "BLOCK"
    ],

    riskLevels: [
      "LOW",
      "MEDIUM",
      "HIGH"
    ],

    checks: [
      "source attribution",
      "source-text overlap",
      "content fingerprint",
      "visual license verification",
      "audio license verification",
      "copyright risk classification"
    ],

    thresholds: {
      reviewOverlapRatio:
        REVIEW_OVERLAP_RATIO,

      blockOverlapRatio:
        BLOCK_OVERLAP_RATIO
    },

    message:
      "Copyright Guard performs an internal originality and licensing pre-check before production/publishing."
  };
}

export default {
  checkCopyrightSafety,
  createCopyrightReviewRequest,
  getContentFingerprint,
  getCopyrightGuardStatus
};