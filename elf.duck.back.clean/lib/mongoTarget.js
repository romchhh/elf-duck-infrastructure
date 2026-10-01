/**
 * Safe Mongo target summary for logs / health (no credentials).
 */
export function describeMongoUri(uri) {
  const raw = String(uri || "").trim();
  if (!raw) {
    return { ok: false, host: "", db: "", kind: "missing" };
  }

  let db = "unknown";
  try {
    const u = new URL(raw.replace(/^mongodb(\+srv)?:/, "https:"));
    const path = u.pathname.replace(/^\//, "");
    if (path) db = path.split("/")[0] || db;
    const host = u.hostname || "";
    const isLocalDocker =
      host === "mongo" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      raw.includes("mongodb://mongo:");
    const isAtlas = raw.includes("mongodb+srv://") || host.includes("mongodb.net");
    return {
      ok: true,
      host,
      db,
      kind: isAtlas ? "atlas" : isLocalDocker ? "docker-local" : "other",
    };
  } catch {
    const m = raw.match(/\/([^/?]+)(\?|$)/);
    if (m?.[1]) db = m[1];
    return {
      ok: true,
      host: "(unparsed)",
      db,
      kind: raw.includes("mongo:27017") ? "docker-local" : "other",
    };
  }
}
