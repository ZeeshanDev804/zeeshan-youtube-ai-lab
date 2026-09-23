import crypto from "node:crypto";

const DEFAULT_SIMILARITY_THRESHOLD = 0.82;
const TITLE_SIMILARITY_THRESHOLD = 0.75;

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
  return new Set(getWords(text));
}

function getNgrams(text = "", size = 3) {
  const words = getWords(text);
  const ngrams = [];

  for (let i = 0; i <= words.length - size; i += 1) {
    ngrams.push(words.slice(i, i + size).join(" "));
  }

  return ngrams;
}

function sha256(text = "") {
  return crypto
    .createHash("sha256")
    .update(normalizeText(text))
    .digest("hex");
}

export function calculateWordSimilarity(textA = "", textB = "") {
  const setA = getWordSet(textA);
  const setB = getWordSet(textB);

  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const word of setA) {
    if (setB.has(word)) {
      intersection += 1;
    }
  }

  const union = new Set([
    ...setA,
    ...setB
  ]).size;

  return union === 0
    ? 0
    : intersection / union;
}

export function calculateNgramSimilarity(
  textA = "",
  textB = "",
  size = 3
) {
  const ngramsA = new Set(getNgrams(textA, size));
  const ngramsB = new Set(getNgrams(textB, size));

  if (ngramsA.size === 0 || ngramsB.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const phrase of ngramsA) {
    if (ngramsB.has(phrase)) {
      intersection += 1;
    }
  }

  const union = new Set([
    ...ngramsA,
    ...ngramsB
  ]).size;

  return union === 0
    ? 0
    : intersection / union;
}

export function calculateSimilarity(
  textA = "",
  textB = ""
) {
  const wordSimilarity = calculateWordSimilarity(
    textA,
    textB
  );

  const ngramSimilarity = calculateNgramSimilarity(
    textA,
    textB,
    3
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
  return {
    titleHash: sha256(title),
    scriptHash: sha256(script),
    combinedHash: sha256(
      `${title}\n${script}`
    )
  };
}

export function compareContent({
  title = "",
  script = "",
  existingContent = []
} = {}) {
  const currentTitle = normalizeText(title);
  const currentScript = normalizeText(script);

  const fingerprint = createContentFingerprint({
    title,
    script
  });

  const matches = [];

  for (const item of existingContent) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const existingTitle =
      item.title || "";

    const existingScript =
      item.script || "";

    const existingFingerprint =
      createContentFingerprint({
        title: existingTitle,
        script: existingScript
      });

    if (
      fingerprint.combinedHash ===
      existingFingerprint.combinedHash
    ) {
      matches.push({
        type: "EXACT",
        similarity: 1,
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
          titleSimilarity * 0.25 +
          scriptSimilarity * 0.75
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
        similarity: overallSimilarity,
        item
      });
    }
  }

  return {
    isDuplicate:
      matches.some(
        (match) => match.type === "EXACT"
      ),

    requiresReview:
      matches.length > 0,

    fingerprint,

    matches
  };
}

export function checkDuplicateContent({
  title = "",
  script = "",
  existingContent = []
} = {}) {
  const result = compareContent({
    title,
    script,
    existingContent
  });

  if (result.isDuplicate) {
    return {
      status: "BLOCK",
      reason:
        "Exact duplicate content detected.",
      ...result
    };
  }

  if (result.requiresReview) {
    return {
      status: "REVIEW",
      reason:
        "Similar existing content detected.",
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
  publishedAt = null
} = {}) {
  return {
    videoId,
    title,
    script,
    publishedAt,
    fingerprint: createContentFingerprint({
      title,
      script
    })
  };
}