const state = new Map();

export const getState = (chatId) => state.get(String(chatId));
export const setState = (chatId, st) => state.set(String(chatId), st);
export const clearState = (chatId) => state.delete(String(chatId));
