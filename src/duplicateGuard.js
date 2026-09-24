import crypto from "node:crypto";

const DEFAULT_SIMILARITY_THRESHOLD = 0.82;
const TITLE_SIMILARITY_THRESHOLD = 0.75;

const MIN_TITLE_LENGTH = 3;
const MIN_SCRIPT_LENGTH = 40;

const NGRAM_SIZE = 3;

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

function getWordSet(text = "") {
  return new Set(
    getWords(text)
  );
}

function getNgrams(
  text = "",
  size = NGRAM_SIZE
) {
  const words =
    getWords(text);

  const ngrams = [];

  if (
    words.length < size
  ) {
    return ngrams;
  }

  for (
    let index = 0;
    index <=
    words.length - size;
    index += 1
  ) {
    ngrams.push(
      words
        .slice(
          index,
          index + size
        )
        .join(" ")
    );
  }

  return ngrams;
}

function sha256(text = "") {
  return crypto
    .createHash("sha256")
    .update(
      normalizeText(text),
      "utf8"
    )
    .digest("hex");
}

function isValidTitle(
  title = ""
) {
  return (
    normalizeText(title)
      .length >=
    MIN_TITLE_LENGTH
  );
}

function isValidScript(
  script = ""
) {
  return (
    normalizeText(script)
      .length >=
    MIN_SCRIPT_LENGTH
  );
}

export function calculateWordSimilarity(
  textA = "",
  textB = ""
) {
  const setA =
    getWordSet(textA);

  const setB =
    getWordSet(textB);

  if (
    setA.size === 0 ||
    setB.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (
    const word of setA
  ) {
    if (
      setB.has(word)
    ) {
      intersection += 1;
    }
  }

  const union =
    new Set([
      ...setA,
      ...setB
    ]).size;

  if (union === 0) {
    return 0;
  }

  return Number(
    (
      intersection /
      union
    ).toFixed(4)
  );
}

export function calculateNgramSimilarity(
  textA = "",
  textB = "",
  size = NGRAM_SIZE
) {
  const ngramsA =
    new Set(
      getNgrams(
        textA,
        size
      )
    );

  const ngramsB =
    new Set(
      getNgrams(
        textB,
        size
      )
    );

  if (
    ngramsA.size === 0 ||
    ngramsB.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (
    const phrase of ngramsA
  ) {
    if (
      ngramsB.has(
        phrase
      )
    ) {
      intersection += 1;
    }
  }

  const union =
    new Set([
      ...ngramsA,
      ...ngramsB
    ]).size;

  if (union === 0) {
    return 0;
  }

  return Number(
    (
      intersection /
      union
    ).toFixed(4)
  );
}

export function calculateSimilarity(
  textA = "",
  textB = ""
) {
  const normalizedA =
    normalizeText(textA);

  const normalizedB =
    normalizeText(textB);

  if (
    !normalizedA ||
    !normalizedB
  ) {
    return 0;
  }

  if (
    normalizedA ===
    normalizedB
  ) {
    return 1;
  }

  const wordSimilarity =
    calculateWordSimilarity(
      normalizedA,
      normalizedB
    );

  const ngramSimilarity =
    calculateNgramSimilarity(
      normalizedA,
      normalizedB,
      NGRAM_SIZE
    );

  return Number(
    (
      wordSimilarity * 0.45 +
      ngramSimilarity * 0.55
    ).toFixed(4)
  );
}

export function createContentFingerprint({
  title = "",
  script = ""
} = {}) {
  const normalizedTitle =
    normalizeText(title);

  const normalizedScript =
    normalizeText(script);

  const combined =
    `${normalizedTitle}\n${normalizedScript}`;

  return {
    titleHash:
      sha256(
        normalizedTitle
      ),

    scriptHash:
      sha256(
        normalizedScript
      ),

    combinedHash:
      sha256(combined)
  };
}

export function compareContent({
  title = "",
  script = "",
  existingContent = []
} = {}) {
  const currentTitle =
    normalizeText(title);

  const currentScript =
    normalizeText(script);

  const validationErrors =
    [];

  if (
    !isValidTitle(
      currentTitle
    )
  ) {
    validationErrors.push(
      "Title is missing or too short."
    );
  }

  if (
    !isValidScript(
      currentScript
    )
  ) {
    validationErrors.push(
      "Script is missing or too short."
    );
  }

  const fingerprint =
    createContentFingerprint({
      title: currentTitle,
      script: currentScript
    });

  if (
    validationErrors.length >
    0
  ) {
    return {
      valid: false,

      isDuplicate: false,

      requiresReview: false,

      fingerprint,

      matches: [],

      validationErrors
    };
  }

  const contentList =
    Array.isArray(
      existingContent
    )
      ? existingContent
      : [];

  const matches = [];

  for (
    const item of contentList
  ) {
    if (
      !item ||
      typeof item !==
        "object"
    ) {
      continue;
    }

    const existingTitle =
      normalizeText(
        item.title || ""
      );

    const existingScript =
      normalizeText(
        item.script || ""
      );

    if (
      !existingTitle &&
      !existingScript
    ) {
      continue;
    }

    const existingFingerprint =
      createContentFingerprint({
        title:
          existingTitle,
        script:
          existingScript
      });

    if (
      fingerprint.combinedHash ===
      existingFingerprint.combinedHash
    ) {
      matches.push({
        type: "EXACT",

        similarity: 1,

        titleSimilarity: 1,

        scriptSimilarity: 1,

        item
      });

      continue;
    }

    const titleSimilarity =
      calculateSimilarity(
        currentTitle,
        existingTitle
      );

    const scriptSimilarity =
      calculateSimilarity(
        currentScript,
        existingScript
      );

    const overallSimilarity =
      Number(
        (
          titleSimilarity *
            0.25 +
          scriptSimilarity *
            0.75
        ).toFixed(4)
      );

    if (
      titleSimilarity >=
        TITLE_SIMILARITY_THRESHOLD ||
      overallSimilarity >=
        DEFAULT_SIMILARITY_THRESHOLD
    ) {
      matches.push({
        type: "SIMILAR",

        titleSimilarity,

        scriptSimilarity,

        similarity:
          overallSimilarity,

        item
      });
    }
  }

  const exactDuplicate =
    matches.some(
      (match) =>
        match.type ===
        "EXACT"
    );

  return {
    valid: true,

    isDuplicate:
      exactDuplicate,

    requiresReview:
      matches.length > 0,

    fingerprint,

    matches,

    validationErrors: []
  };
}

export function checkDuplicateContent({
  title = "",
  script = "",
  existingContent = []
} = {}) {
  const result =
    compareContent({
      title,
      script,
      existingContent
    });

  if (
    !result.valid
  ) {
    return {
      status: "BLOCK",

      reason:
        "Invalid content cannot pass duplicate protection.",

      ...result
    };
  }

  if (
    result.isDuplicate
  ) {
    return {
      status: "BLOCK",

      reason:
        "Exact duplicate content detected.",

      ...result
    };
  }

  if (
    result.requiresReview
  ) {
    return {
      status: "REVIEW",

      reason:
        "Similar existing content detected. Human/CEO review is required before publishing.",

      ...result
    };
  }

  return {
    status: "PASS",

    reason:
      "No significant duplicate detected.",

    ...result
  };
}

export function buildDuplicateRecord({
  title = "",
  script = "",
  videoId = null,
  publishedAt = null,
  contentStatus = "PUBLISHED"
} = {}) {
  const fingerprint =
    createContentFingerprint({
      title,
      script
    });

  return {
    videoId,

    title:
      String(title).trim(),

    script:
      String(script).trim(),

    publishedAt,

    contentStatus,

    fingerprint,

    createdAt:
      new Date().toISOString()
  };
}

export function getDuplicateGuardStatus() {
  return {
    configured: true,

    status: "READY",

    thresholds: {
      overallSimilarity:
        DEFAULT_SIMILARITY_THRESHOLD,

      titleSimilarity:
        TITLE_SIMILARITY_THRESHOLD
    },

    decisions: {
      exact:
        "BLOCK",

      similar:
        "REVIEW",

      new:
        "PASS",

      invalid:
        "BLOCK"
    },

    checks: [
      "exact content fingerprint",
      "title similarity",
      "script similarity",
      "word similarity",
      "n-gram similarity",
      "invalid content blocking"
    ],

    message:
      "Duplicate Guard blocks exact duplicates, sends highly similar content to review, and allows sufficiently original content."
  };
}

export default {
  calculateWordSimilarity,
  calculateNgramSimilarity,
  calculateSimilarity,
  createContentFingerprint,
  compareContent,
  checkDuplicateContent,
  buildDuplicateRecord,
  getDuplicateGuardStatus
};