const STORAGE_KEY = 'elfduck_crm_session_token';

export function getCrmSessionToken() {
  try {
    return String(localStorage.getItem(STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setCrmSessionToken(token) {
  try {
    const value = String(token || '').trim();
    if (!value) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function clearCrmSessionToken() {
  setCrmSessionToken('');
}
