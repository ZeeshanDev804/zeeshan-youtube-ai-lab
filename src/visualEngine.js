import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_ASSET_DIR = "./storage/assets";

const SUPPORTED_IMAGE_TYPES = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp"
];

function createAssetId() {
  return `asset_${crypto
    .randomBytes(8)
    .toString("hex")}`;
}

function normalizeText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function validateAsset(asset = {}) {
  const errors = [];

  if (
    !asset ||
    typeof asset !== "object"
  ) {
    return {
      valid: false,
      errors: ["Asset must be an object."]
    };
  }

  if (
    !asset.path ||
    typeof asset.path !== "string"
  ) {
    errors.push(
      "Asset path is required."
    );
  }

  if (
    asset.licenseVerified !== true
  ) {
    errors.push(
      "Asset license must be verified."
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function createVisualAsset({
  path: filePath,
  type = "image",
  source = "unknown",
  license = "unknown",
  licenseVerified = false,
  attribution = null,
  altText = ""
} = {}) {
  return {
    id: createAssetId(),
    type,
    path: filePath || null,
    source,
    license,
    licenseVerified,
    attribution,
    altText:
      normalizeText(altText),
    createdAt:
      new Date().toISOString()
  };
}

export function validateVisualAsset(
  asset
) {
  const result =
    validateAsset(asset);

  if (!result.valid) {
    return {
      valid: false,
      errors: result.errors
    };
  }

  const extension =
    path.extname(
      asset.path
    ).toLowerCase();

  if (
    !SUPPORTED_IMAGE_TYPES.includes(
      extension
    )
  ) {
    return {
      valid: false,
      errors: [
        `Unsupported image format: ${extension}`
      ]
    };
  }

  return {
    valid: true,
    extension
  };
}

export async function checkVisualAsset(
  asset
) {
  const validation =
    validateVisualAsset(asset);

  if (!validation.valid) {
    return validation;
  }

  try {
    const stats =
      await fs.stat(asset.path);

    if (!stats.isFile()) {
      return {
        valid: false,
        errors: [
          "Visual asset path is not a file."
        ]
      };
    }

    if (stats.size === 0) {
      return {
        valid: false,
        errors: [
          "Visual asset file is empty."
        ]
      };
    }

    return {
      valid: true,
      sizeBytes: stats.size,
      extension:
        validation.extension,
      licenseVerified:
        asset.licenseVerified === true
    };
  } catch {
    return {
      valid: false,
      errors: [
        "Visual asset file does not exist."
      ]
    };
  }
}

export async function prepareVisualAssetDirectory(
  directory = DEFAULT_ASSET_DIR
) {
  await fs.mkdir(
    directory,
    {
      recursive: true
    }
  );

  return {
    directory:
      path.resolve(directory),
    ready: true
  };
}

export function buildVisualTimeline({
  durationSeconds = 30,
  assets = [],
  maxAssets = 10
} = {}) {
  const duration =
    Number(durationSeconds);

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return {
      ready: false,
      error:
        "Valid duration is required."
    };
  }

  if (!Array.isArray(assets)) {
    return {
      ready: false,
      error:
        "Assets must be an array."
    };
  }

  const selectedAssets =
    assets.slice(
      0,
      Math.max(1, maxAssets)
    );

  const interval =
    duration /
    Math.max(
      selectedAssets.length,
      1
    );

  const timeline =
    selectedAssets.map(
      (asset, index) => {
        const start =
          Number(
            (
              index * interval
            ).toFixed(2)
          );

        const end =
          Number(
            (
              (index + 1) *
              interval
            ).toFixed(2)
          );

        return {
          assetId:
            asset.id || null,
          path:
            asset.path || null,
          start,
          end,
          duration:
            Number(
              (
                end - start
              ).toFixed(2)
            )
        };
      }
    );

  return {
    ready: true,
    durationSeconds: duration,
    timeline
  };
}

export async function validateVisualCollection(
  assets = []
) {
  if (!Array.isArray(assets)) {
    return {
      safe: false,
      validAssets: [],
      invalidAssets: [
        {
          reason:
            "Assets must be an array."
        }
      ]
    };
  }

  const validAssets = [];
  const invalidAssets = [];

  for (const asset of assets) {
    const result =
      await checkVisualAsset(
        asset
      );

    if (result.valid) {
      validAssets.push({
        asset,
        check: result
      });
    } else {
      invalidAssets.push({
        asset,
        check: result
      });
    }
  }

  return {
    safe:
      invalidAssets.length === 0 &&
      validAssets.length > 0,
    validAssets,
    invalidAssets
  };
}

export function createVisualPlan({
  title = "",
  durationSeconds = 30,
  assets = []
} = {}) {
  const timeline =
    buildVisualTimeline({
      durationSeconds,
      assets
    });

  return {
    status:
      timeline.ready
        ? "READY_FOR_RENDER"
        : "INVALID",
    title:
      normalizeText(title),
    durationSeconds,
    assetCount:
      Array.isArray(assets)
        ? assets.length
        : 0,
    timeline:
      timeline.ready
        ? timeline.timeline
        : [],
    errors:
      timeline.ready
        ? []
        : [timeline.error]
  };
}
