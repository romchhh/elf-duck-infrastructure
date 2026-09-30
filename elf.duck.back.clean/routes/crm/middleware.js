import express from "express";
import {
  requireCrmPushAdmin,
} from "./deps.js";

export function crmAuthMiddleware(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  const openPaths = new Set([
    "/auth/login",
    "/auth/logout",
    "/auth/session",
  ]);

  if (openPaths.has(req.path)) {
    return next();
  }

  return requireCrmPushAdmin(req, res, next);
}

export default crmAuthMiddleware;
