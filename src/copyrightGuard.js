import crypto from "node:crypto";

const MAX_SOURCE_PHRASE_LENGTH = 12;
const MIN_TEXT_LENGTH = 80;

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

function getNgrams(words, size = 5) {
  const result = [];

  for (let i = 0; i <= words.length - size; i += 1) {
    result.push(words.slice(i, i + size).join(" "));
  }

  return result;
}

function hashText(text = "") {
  return crypto
    .createHash("sha256")
    .update(normalizeText(text))
    .digest("hex");
}

function phraseOverlap(originalText, sourceText) {
  const originalWords = getWords(originalText);
  const sourceWords = getWords(sourceText);

  if (
    originalWords.length < MIN_TEXT_LENGTH ||
    sourceWords.length < MIN_TEXT_LENGTH
  ) {
    return {
      checked: false,
      matchedPhrases: [],
      matchCount: 0
    };
  }

  const sourceNgrams = new Set(
    getNgrams(sourceWords, 5)
  );

  const originalNgrams = getNgrams(originalWords, 5);

  const matchedPhrases = [];

  for (const phrase of originalNgrams) {
    if (sourceNgrams.has(phrase)) {
      matchedPhrases.push(phrase);

      if (
        matchedPhrases.length >= MAX_SOURCE_PHRASE_LENGTH
      ) {
        break;
      }
    }
  }

  return {
    checked: true,
    matchedPhrases,
    matchCount: matchedPhrases.length
  };
}

function checkSourceAttribution(sources = []) {
  if (!Array.isArray(sources)) {
    return {
      passed: false,
      reason: "Sources must be an array."
    };
  }

  if (sources.length === 0) {
    return {
      passed: false,
      reason: "No sources supplied."
    };
  }

  const validSources = sources.filter((source) => {
    return (
      source &&
      typeof source === "object" &&
      typeof source.url === "string" &&
      source.url.trim().length > 0
    );
  });

  if (validSources.length === 0) {
    return {
      passed: false,
      reason: "No valid source URLs supplied."
    };
  }

  return {
    passed: true,
    sourceCount: validSources.length
  };
}

function checkScriptAgainstSources(script, sources = []) {
  const findings = [];

  for (const source of sources) {
    if (!source || typeof source.text !== "string") {
      continue;
    }

    const result = phraseOverlap(script, source.text);

    if (result.matchCount > 0) {
      findings.push({
        sourceUrl: source.url || null,
        matchCount: result.matchCount,
        matchedPhrases: result.matchedPhrases
      });
    }
  }

  return findings;
}

function checkLicensing(metadata = {}) {
  const visuals = Array.isArray(metadata.visuals)
    ? metadata.visuals
    : [];

  const audio = Array.isArray(metadata.audio)
    ? metadata.audio
    : [];

  const unverifiedVisuals = visuals.filter((item) => {
    return (
      !item ||
      item.licenseVerified !== true
    );
  });

  const unverifiedAudio = audio.filter((item) => {
    return (
      !item ||
      item.licenseVerified !== true
    );
  });

  return {
    visualsChecked: visuals.length,
    audioChecked: audio.length,
    unverifiedVisuals: unverifiedVisuals.length,
    unverifiedAudio: unverifiedAudio.length,
    passed:
      unverifiedVisuals.length === 0 &&
      unverifiedAudio.length === 0
  };
}

export function checkCopyrightSafety({
  title = "",
  script = "",
  sources = [],
  metadata = {}
} = {}) {
  const combinedText = `${title}\n${script}`.trim();

  const sourceCheck = checkSourceAttribution(sources);

  const sourceFindings = checkScriptAgainstSources(
    combinedText,
    sources
  );

  const licensing = checkLicensing(metadata);

  const warnings = [];

  if (!sourceCheck.passed) {
    warnings.push(sourceCheck.reason);
  }

  if (sourceFindings.length > 0) {
    warnings.push(
      "Potential source-text overlap detected."
    );
  }

  if (!licensing.passed) {
    warnings.push(
      "One or more media assets do not have verified licensing metadata."
    );
  }

  const status =
    warnings.length === 0
      ? "PASS"
      : "REVIEW";

  return {
    status,
    safe:
      status === "PASS",
    contentHash: hashText(combinedText),
    sourceCheck,
    sourceFindings,
    licensing,
    warnings,
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
  const result = checkCopyrightSafety({
    title,
    script,
    sources,
    metadata
  });

  return {
    requiresCEOReview: !result.safe,
    reason: result.safe
      ? "Copyright pre-check passed."
      : "Copyright/originality review required.",
    result
  };
}

export function getContentFingerprint(title = "", script = "") {
  return hashText(`${title}\n${script}`);
}
