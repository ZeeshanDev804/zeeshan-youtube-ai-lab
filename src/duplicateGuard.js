import crypto from "node:crypto";

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createContentHash({
  title = "",
  script = ""
} = {}) {
  const normalized = normalizeText(
    `${title} ${script}`
  );

  return crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex");
}

export function calculateSimilarity(a = "", b = "") {
  const first = new Set(normalizeText(a).split(" "));
  const second = new Set(normalizeText(b).split(" "));

  if (!first.size || !second.size) {
    return 0;
  }

  let intersection = 0;

  for (const word of first) {
    if (second.has(word)) {
      intersection += 1;
    }
  }

  const union = new Set([...first, ...second]).size;

  return union === 0
    ? 0
    : intersection / union;
}

export function isDuplicate({
  title,
  script,
  previousItems = [],
  similarityThreshold = 0.75
} = {}) {
  const currentHash = createContentHash({
    title,
    script
  });

  for (const item of previousItems) {
    if (item.hash && item.hash === currentHash) {
      return {
        duplicate: true,
        reason: "Exact content hash match."
      };
    }

    const similarity = calculateSimilarity(
      script,
      item.script || ""
    );

    if (similarity >= similarityThreshold) {
      return {
        duplicate: true,
        reason: "Content is too similar to previous content.",
        similarity
      };
    }
  }

  return {
    duplicate: false,
    hash: currentHash
  };
}
