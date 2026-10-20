import {
  clearCrmSessionToken,
  getCrmSessionToken,
} from '@/lib/crmSession';

export const CRM_API_URL = String(
  import.meta.env.VITE_CRM_API_URL || ''
).replace(/\/+$/, '');

export async function crmFetch(path, options = {}) {
  if (!CRM_API_URL) {
    throw new Error('VITE_CRM_API_URL is not configured');
  }

  const sessionToken = getCrmSessionToken();
  const headers = {
    ...(options.headers || {}),
    ...(sessionToken ? { 'x-crm-session': sessionToken } : {}),
  };

  const hasBody =
    options.body !== undefined &&
    options.body !== null &&
    !(options.body instanceof FormData);

  return fetch(`${CRM_API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  });
}

export async function crmFetchJson(path, options = {}) {
  const response = await crmFetch(path, options);
  const contentType = String(response.headers.get('content-type') || '');
  let data = {};

  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  } else {
    const text = await response.text().catch(() => '');
    data = {
      ok: false,
      error: `HTTP_${response.status}`,
      message:
        response.status === 413
          ? 'Файл слишком большой для прокси (HTTP 413). Сжимаем на клиенте / увеличьте client_max_body_size на nginx.'
          : text.slice(0, 200) || `HTTP_${response.status}`,
    };
  }

  if (!response.ok || data?.ok === false) {
    if (response.status === 401) {
      clearCrmSessionToken();
    }

    const error = new Error(
      data?.message || data?.error || `HTTP_${response.status}`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}
