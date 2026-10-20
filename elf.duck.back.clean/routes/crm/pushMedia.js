import express from "express";
import {
  CRM_PUSH_MEDIA_MAX_BYTES,
  CRM_PUSH_MEDIA_ALLOWED_TYPES,
  requireCrmPushAdmin,
} from "./deps.js";
import {
  readMultipartFile,
  savePushMediaBuffer,
} from "../../lib/crm/pushMediaStorage.js";

const router = express.Router();

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "")
    .trim()
    .match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);

  if (!match) return null;

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2].replace(/\s+/g, ""), "base64"),
  };
}

router.post(
  "/push/upload-media",
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const contentTypeHeader = String(req.headers["content-type"] || "").toLowerCase();

      let contentType = "";
      let buffer = null;

      if (contentTypeHeader.includes("multipart/form-data")) {
        const file = await readMultipartFile(req, "file");
        contentType = file.contentType;
        buffer = file.buffer;
      } else {
        // Fallback для старих клієнтів (dataUrl JSON)
        const parsed = parseDataUrl(req.body?.dataUrl);
        if (!parsed) {
          return res.status(400).json({
            ok: false,
            error: "INVALID_PUSH_MEDIA",
            message: "Ожидается multipart file или dataUrl",
          });
        }
        contentType = parsed.contentType;
        buffer = parsed.buffer;
      }

      if (!CRM_PUSH_MEDIA_ALLOWED_TYPES.has(contentType)) {
        return res.status(400).json({
          ok: false,
          error: "UNSUPPORTED_PUSH_MEDIA_TYPE",
        });
      }

      if (
        !buffer ||
        buffer.length <= 0 ||
        buffer.length > CRM_PUSH_MEDIA_MAX_BYTES
      ) {
        return res.status(400).json({
          ok: false,
          error: "PUSH_MEDIA_TOO_LARGE",
        });
      }

      const saved = await savePushMediaBuffer({ buffer, contentType });
      const photoPreviewUrl = String(saved?.url || "").trim();

      if (!photoPreviewUrl) {
        return res.status(500).json({
          ok: false,
          error: "PUSH_MEDIA_SAVE_FAILED",
        });
      }

      return res.json({
        ok: true,
        url: photoPreviewUrl,
        photoPreviewUrl,
        fileId: "",
      });
    } catch (error) {
      console.error("[CRM PUSH MEDIA] upload failed", error);

      return res.status(500).json({
        ok: false,
        error: String(error?.message || "PUSH_MEDIA_UPLOAD_FAILED"),
        message: String(
          error?.response?.description ||
            error?.message ||
            error ||
            "PUSH_MEDIA_UPLOAD_FAILED"
        ),
      });
    }
  }
);

export default router;
