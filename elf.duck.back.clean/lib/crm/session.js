import crypto from "crypto";
import {
  CRM_SESSION_COOKIE,
  CRM_SESSION_TTL_MS,
} from "./constants.js";

export function getCrmSessionSecret() {
  return String(
    process.env.CRM_SESSION_SECRET ||
      process.env.ADMIN_API_TOKEN ||
      ""
  ).trim();
}

export function parseCookieHeader(
  header = ""
) {
  const result = {};

  for (
    const chunk of
    String(header || "").split(";")
  ) {
    const index =
      chunk.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const key =
      chunk
        .slice(0, index)
        .trim();

    const value =
      chunk
        .slice(index + 1)
        .trim();

    if (!key) {
      continue;
    }

    result[key] =
      decodeURIComponent(value);
  }

  return result;
}

export function signCrmSession(
  payload
) {
  const secret =
    getCrmSessionSecret();

  if (!secret) {
    return "";
  }

  const encoded =
    Buffer.from(
      JSON.stringify(payload),
      "utf8"
    ).toString(
      "base64url"
    );

  const signature =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(encoded)
      .digest(
        "base64url"
      );

  return `${encoded}.${signature}`;
}

export function verifyCrmSessionToken(
  token
) {
  const secret =
    getCrmSessionSecret();

  if (
    !secret ||
    !token
  ) {
    return false;
  }

  const [
    encoded,
    signature,
  ] =
    String(token).split(".");

  if (
    !encoded ||
    !signature
  ) {
    return false;
  }

  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(encoded)
      .digest(
        "base64url"
      );

  const left =
    Buffer.from(signature);

  const right =
    Buffer.from(
      expectedSignature
    );

  if (
    left.length !==
      right.length ||
    !crypto.timingSafeEqual(
      left,
      right
    )
  ) {
    return false;
  }

  try {
    const payload =
      JSON.parse(
        Buffer.from(
          encoded,
          "base64url"
        ).toString(
          "utf8"
        )
      );

    return Boolean(
      payload?.exp &&
        Number(
          payload.exp
        ) >
          Date.now()
    );
  } catch {
    return false;
  }
}

export function hasValidCrmSession(
  req
) {
  const headerToken = String(
    req.headers?.["x-crm-session"] || ""
  ).trim();

  if (
    headerToken &&
    verifyCrmSessionToken(headerToken)
  ) {
    return true;
  }

  const cookies =
    parseCookieHeader(
      req.headers?.cookie ||
        ""
    );

  return verifyCrmSessionToken(
    cookies[
      CRM_SESSION_COOKIE
    ]
  );
}

export function requireCrmPushAdmin(
  req,
  res,
  next
) {
  if (
    hasValidCrmSession(
      req
    )
  ) {
    return next();
  }

  const expectedToken =
    String(
      process.env.ADMIN_API_TOKEN ||
        ""
    ).trim();

  const providedToken =
    String(
      req.headers?.[
        "x-admin-token"
      ] || ""
    ).trim();

  if (!expectedToken) {
    return res
      .status(503)
      .json({
        ok: false,
        error:
          "ADMIN_API_TOKEN_NOT_CONFIGURED",
      });
  }

  if (
    !providedToken ||
    providedToken !==
      expectedToken
  ) {
    return res
      .status(401)
      .json({
        ok: false,
        error:
          "UNAUTHORIZED",
      });
  }

  next();
}
