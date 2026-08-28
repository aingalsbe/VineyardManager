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
  contentType: string,
  buffer: Buffer,
): Promise<{ relativePath: string; contentType: string }> {
  const ext = logoExtension(contentType);
  const relativePath = path.posix.join("vineyards", vineyardId, `logo${ext}`);
  const abs = absoluteLogoPath(relativePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return { relativePath, contentType };
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
