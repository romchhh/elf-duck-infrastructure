import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export function getPushUploadDir() {
  const raw = String(process.env.PUSH_UPLOAD_DIR || "").trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.join(backendRoot, raw);
  }
  return path.join(backendRoot, "data/push-uploads");
}

export function getPushMediaPublicBaseUrl() {
  const base = String(
    process.env.PUSH_MEDIA_PUBLIC_BASE_URL ||
      process.env.CATALOG_MEDIA_PUBLIC_BASE_URL ||
      process.env.API_URL ||
      process.env.VITE_CRM_API_URL ||
      process.env.VITE_API_URL ||
      ""
  ).trim();

  if (base) return base.replace(/\/$/, "");

  const port = String(process.env.PORT || "3000");
  return `http://localhost:${port}`;
}

export async function savePushMediaBuffer({ buffer, contentType }) {
  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : "jpg";

  const dir = getPushUploadDir();
  await fs.mkdir(dir, { recursive: true });

  const name = `push-${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, buffer);

  const url = `${getPushMediaPublicBaseUrl()}/push-media/${name}`;

  return { url, filePath, fileName: name };
}

/**
 * Мінімальний multipart parser (одне поле file) без сторонніх залежностей.
 */
export async function readMultipartFile(req, fieldName = "file") {
  const contentType = String(req.headers["content-type"] || "");
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = String(boundaryMatch?.[1] || boundaryMatch?.[2] || "").trim();

  if (!boundary) {
    throw new Error("INVALID_MULTIPART_BOUNDARY");
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];

  let start = body.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = body.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    parts.push(body.subarray(start + boundaryBuf.length, next));
    start = next;
  }

  for (const part of parts) {
    // skip leading CRLF after boundary
    let offset = 0;
    if (part[0] === 0x0d && part[1] === 0x0a) offset = 2;

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"), offset);
    if (headerEnd === -1) continue;

    const headerText = part.subarray(offset, headerEnd).toString("utf8");
    // strip trailing CRLF before next boundary
    let data = part.subarray(headerEnd + 4);
    if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.subarray(0, data.length - 2);
    }

    const nameMatch = headerText.match(/name="([^"]+)"/i);
    const name = String(nameMatch?.[1] || "");
    if (name !== fieldName) continue;

    const filenameMatch = headerText.match(/filename="([^"]*)"/i);
    const filename = String(filenameMatch?.[1] || "").trim();
    const typeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
    const mime = String(typeMatch?.[1] || "application/octet-stream").trim().toLowerCase();

    return {
      buffer: Buffer.from(data),
      contentType: mime,
      filename,
    };
  }

  throw new Error("MULTIPART_FILE_MISSING");
}
