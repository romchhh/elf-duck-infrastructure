import express from "express";
import {
  CRM_SESSION_COOKIE,
  CRM_SESSION_TTL_MS,
  signCrmSession,
  hasValidCrmSession,
  crypto,
} from "./deps.js";

const router = express.Router();

router.post(
  "/auth/login",
  express.json(),
  (req, res) => {
    const expectedPassword =
      String(
        process.env
          .CRM_ADMIN_PASSWORD ||
          ""
      ).trim();

    const password =
      String(
        req.body?.password ||
          ""
      );

    if (
      !expectedPassword
    ) {
      return res
        .status(503)
        .json({
          ok: false,
          error:
            "CRM_ADMIN_PASSWORD_NOT_CONFIGURED",
        });
    }

    const left =
      Buffer.from(
        password
      );

    const right =
      Buffer.from(
        expectedPassword
      );

    const valid =
      left.length ===
        right.length &&
      crypto.timingSafeEqual(
        left,
        right
      );

    if (!valid) {
      return res
        .status(401)
        .json({
          ok: false,
          error:
            "INVALID_CRM_PASSWORD",
        });
    }

    const token =
      signCrmSession({
        exp:
          Date.now() +
          CRM_SESSION_TTL_MS,
      });

    if (!token) {
      return res
        .status(503)
        .json({
          ok: false,
          error:
            "CRM_SESSION_SECRET_NOT_CONFIGURED",
        });
    }

    res.cookie(
      CRM_SESSION_COOKIE,
      token,
      {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge:
          CRM_SESSION_TTL_MS,
        path: "/crm",
      }
    );

return res.json({

  ok: true,

  sessionToken: token,

  expiresInMs:

    CRM_SESSION_TTL_MS,

});
  }
);

router.post(
  "/auth/logout",
  (req, res) => {
    res.clearCookie(
      CRM_SESSION_COOKIE,
      {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/crm",
      }
    );

    return res.json({
      ok: true,
    });
  }
);

router.get(
  "/auth/session",
  (req, res) => {
    return res.json({
      ok: true,
      authenticated:
        hasValidCrmSession(
          req
        ),
    });
  }
);

export default router;
