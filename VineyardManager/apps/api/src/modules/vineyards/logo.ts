import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { HttpError } from "../../middleware/error-handler.js";

export const LOGO_MAX_BYTES = 1024 * 1024;

export const LOGO_MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Detect PNG, JPEG, or WebP from actual file magic bytes (never trust client Content-Type alone). */
export function detectLogoMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && PNG_SIG.every((byte, idx) => buffer[idx] === byte)) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function logoExtension(contentType: string): string {
  const ext = LOGO_MIME_TO_EXT[contentType];
  if (!ext) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Use a PNG, JPEG, or WebP image",
    );
  }
  return ext;
}

export function absoluteLogoPath(relativePath: string): string {
  const resolved = path.resolve(config.uploadDir, relativePath);
  const root = path.resolve(config.uploadDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid logo path");
  }
  return resolved;
}

export async function writeLogoFile(
  vineyardId: string,
  _claimedContentType: string,
  buffer: Buffer,
): Promise<{ relativePath: string; contentType: string }> {
  const detectedMime = detectLogoMime(buffer);
  if (!detectedMime) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Use a valid PNG, JPEG, or WebP image",
    );
  }
  const ext = logoExtension(detectedMime);
  const relativePath = path.posix.join("vineyards", vineyardId, `logo${ext}`);
  const abs = absoluteLogoPath(relativePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return { relativePath, contentType: detectedMime };
}

export async function removeLogoFile(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  try {
    await unlink(absoluteLogoPath(relativePath));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "ENOENT") throw error;
  }
}
