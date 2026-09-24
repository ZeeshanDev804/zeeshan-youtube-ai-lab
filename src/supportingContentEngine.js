import crypto from "node:crypto";
import {
  checkDuplicateContent
} from "./duplicateGuard.js";

const CONTENT_TYPES = [
  "QUOTE",
  "TIP",
  "QUESTION",
  "SHORT_SUPPORT"
];

const MAX_DAILY_POSTS = 5;

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function fingerprint(text) {
  return crypto
    .createHash("sha256")
    .update(cleanText(text).toLowerCase())
    .digest("hex");
}

function buildContent(type, topic) {
  const cleanTopic = cleanText(topic);

  switch (type) {
    case "QUOTE":
      return {
        title: `Daily Inspiration: ${cleanTopic}`,
        text: `Small consistent steps can turn a simple idea about ${cleanTopic} into meaningful progress.`
      };

    case "TIP":
      return {
        title: `Useful Tip: ${cleanTopic}`,
        text: `Useful tip: focus on one practical improvement related to ${cleanTopic}, verify the information, and apply it consistently.`
      };

    case "QUESTION":
      return {
        title: `What Do You Think About ${cleanTopic}?`,
        text: `What is the most useful thing people should know about ${cleanTopic}? Share your view and experiences.`
      };

    case "SHORT_SUPPORT":
      return {
        title: `More About ${cleanTopic}`,
        text: `This supporting post adds useful context to our latest Short about ${cleanTopic}. Follow for more original and practical content.`
      };

    default:
      throw new Error(`Unsupported content type: ${type}`);
  }
}

export function createSupportingContent({
  type = "TIP",
  topic,
  existingContent = [],
  requestedBy = "automation"
} = {}) {
  if (!CONTENT_TYPES.includes(type)) {
    return {
      success: false,
      status: "INVALID_CONTENT_TYPE"
    };
  }

  const cleanTopic = cleanText(topic);

  if (!cleanTopic) {
    return {
      success: false,
      status: "INVALID_TOPIC"
    };
  }

  const content = buildContent(type, cleanTopic);
  const contentFingerprint = fingerprint(content.text);

  const duplicateResult = checkDuplicateContent({
    title: content.title,
    script: content.text,
    existingContent
  });

  if (duplicateResult?.isDuplicate === true) {
    return {
      success: false,
      status: "DUPLICATE_BLOCKED",
      duplicate: duplicateResult
    };
  }

  return {
    success: true,
    status: "READY",
    content: {
      type,
      title: content.title,
      text: content.text,
      fingerprint: contentFingerprint,
      topic: cleanTopic
    },
    metadata: {
      requestedBy,
      originalContent: true,
      risk: "LOW",
      requiresApproval: false,
      maxDailyPosts: MAX_DAILY_POSTS,
      createdAt: new Date().toISOString()
    }
  };
}

export function createSupportingContentBatch({
  topic,
  existingContent = [],
  types = CONTENT_TYPES
} = {}) {
  const results = [];

  for (const type of types) {
    const result = createSupportingContent({
      type,
      topic,
      existingContent
    });

    if (result.success) {
      results.push(result);
      existingContent = [
        ...existingContent,
        {
          title: result.content.title,
          script: result.content.text
        }
      ];
    }
  }

  return {
    success: true,
    status: "BATCH_READY",
    count: results.length,
    maxDailyPosts: MAX_DAILY_POSTS,
    items: results
  };
}

export function getSupportingContentStatus() {
  return {
    configured: true,
    status: "READY",
    contentTypes: CONTENT_TYPES,
    maxDailyPosts: MAX_DAILY_POSTS,
    duplicateProtection: true,
    originalContentOnly: true,
    riskControl: true
  };
}

export default {
  createSupportingContent,
  createSupportingContentBatch,
  getSupportingContentStatus
};
