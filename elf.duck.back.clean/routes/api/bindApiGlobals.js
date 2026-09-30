import { getServerContext } from "../../lib/server/context.js";

/** Route handlers use bare globals (Category, User, …); never use Object.assign — `crypto` breaks it. */
export function bindApiGlobals() {
  const runtime = getServerContext();
  for (const [key, value] of Object.entries(runtime)) {
    globalThis[key] = value;
  }
}
