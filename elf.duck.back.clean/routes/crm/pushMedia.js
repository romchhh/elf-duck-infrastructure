import express from "express";
import {
  CRM_PUSH_MEDIA_MAX_BYTES,
  CRM_PUSH_MEDIA_ALLOWED_TYPES,
  requireCrmPushAdmin,
} from "./deps.js";

const router = express.Router();

router.post(
  "/push/upload-media",
  express.json({
    limit: "14mb",
  }),
  requireCrmPushAdmin,
  async (req, res) => {
    try {
      const dataUrl =
        String(
          req.body?.dataUrl || ""
        ).trim();

      const match =
        dataUrl.match(
          /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/
        );

      if (!match) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "INVALID_PUSH_MEDIA",
          });
      }

      const contentType =
        match[1];

      if (
        !CRM_PUSH_MEDIA_ALLOWED_TYPES.has(
          contentType
        )
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "UNSUPPORTED_PUSH_MEDIA_TYPE",
          });
      }

      const buffer =
        Buffer.from(
          match[2].replace(
            /\s+/g,
            ""
          ),
          "base64"
        );

      if (
        buffer.length <= 0 ||
        buffer.length >
          CRM_PUSH_MEDIA_MAX_BYTES
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "PUSH_MEDIA_TOO_LARGE",
          });
      }

      const upload =
        req.app.locals
          .uploadCrmBroadcastPhoto;

      if (
        typeof upload !==
        "function"
      ) {
        return res
          .status(503)
          .json({
            ok: false,
            error:
              "CRM_BROADCAST_MEDIA_ENGINE_UNAVAILABLE",
          });
      }

      const result =
        await upload({
          buffer,
          contentType,
        });

      const fileId =
        String(
          result?.fileId || ""
        ).trim();

      if (!fileId) {
        throw new Error(
          "TELEGRAM_FILE_ID_MISSING"
        );
      }

      const photoPreviewUrl =
  String(
    result?.photoPreviewUrl ||
      ""
  ).trim();

return res.json({

  ok: true,

  fileId,

  photoPreviewUrl,

});
} catch (error) {
  console.error(
    "[CRM PUSH MEDIA] upload failed",
    error
  );

  return res
    .status(500)
    .json({
      ok: false,

      error:
        "PUSH_MEDIA_UPLOAD_FAILED",

      message:
        String(
          error?.response
            ?.description ||
            error?.message ||
            error ||
            "PUSH_MEDIA_UPLOAD_FAILED"
        ),
    });
}
  }
);

export default router;
