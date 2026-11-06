import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export function getReviewUploadDir() {
  const raw = String(process.env.REVIEW_UPLOAD_DIR || "").trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(backendRoot, raw);
  }
  return path.join(backendRoot, "data/review-uploads");
}

export function getReviewMediaPublicBaseUrl() {
  const base = String(
    process.env.REVIEW_MEDIA_PUBLIC_BASE_URL ||
      process.env.PUSH_MEDIA_PUBLIC_BASE_URL ||
      process.env.CATALOG_MEDIA_PUBLIC_BASE_URL ||
      process.env.API_URL ||
      ""
  ).trim();

  if (base) return base.replace(/\/$/, "");

  const port = String(process.env.PORT || "3000");
  return `http://localhost:${port}`;
}

export async function saveReviewMediaBuffer({ buffer, contentType }) {
  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";

  const dir = getReviewUploadDir();
  await fs.mkdir(dir, { recursive: true });

  const name = `review-${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, buffer);

  const url = `${getReviewMediaPublicBaseUrl()}/review-media/${name}`;

  return { url, filePath, fileName: name };
}
