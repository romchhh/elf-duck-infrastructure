/**
 * Shared runtime for shop API routes and Telegram bots (populated at bootstrap).
 */
export const serverContext = {};

export function setServerContext(partial) {
  Object.assign(serverContext, partial);
}

export function getServerContext() {
  return serverContext;
}
