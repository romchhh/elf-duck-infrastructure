import { crmFetch } from '@/lib/crmFetch';

async function parseJson(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    const detail = String(json?.message || json?.error || `HTTP_${res.status}`);
    throw new Error(detail);
  }
  return json;
}

export async function listCategories({ activeOnly = false } = {}) {
  const res = await crmFetch(
    `/crm/catalog/categories?active=${activeOnly ? '1' : '0'}`
  );
  const json = await parseJson(res);
  return json.categories || [];
}

export async function saveCategory(id, body) {
  const res = await crmFetch(
    id ? `/crm/catalog/categories/${id}` : '/crm/catalog/categories',
    {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const json = await parseJson(res);
  return json.category;
}

export async function deleteCategory(id) {
  const res = await crmFetch(`/crm/catalog/categories/${id}`, {
    method: 'DELETE',
  });
  await parseJson(res);
}

export async function listProducts({ activeOnly = false, categoryKey = '' } = {}) {
  const q = new URLSearchParams();
  q.set('active', activeOnly ? '1' : '0');
  if (categoryKey) q.set('categoryKey', categoryKey);
  const res = await crmFetch(`/crm/catalog/products?${q}`);
  const json = await parseJson(res);
  return json.products || [];
}

export async function getProduct(id) {
  const res = await crmFetch(`/crm/catalog/products/${id}`);
  const json = await parseJson(res);
  return json.product;
}

export async function saveProduct(id, body) {
  const res = await crmFetch(
    id ? `/crm/catalog/products/${id}` : '/crm/catalog/products',
    {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const json = await parseJson(res);
  return json.product;
}

export async function deleteProduct(id) {
  const res = await crmFetch(`/crm/catalog/products/${id}`, { method: 'DELETE' });
  await parseJson(res);
}

export async function upsertFlavor(productId, body) {
  const res = await crmFetch(`/crm/catalog/products/${productId}/flavors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await parseJson(res);
  return json.product;
}

export async function deleteFlavor(productId, flavorId) {
  const res = await crmFetch(
    `/crm/catalog/products/${productId}/flavors/${flavorId}`,
    { method: 'DELETE' }
  );
  const json = await parseJson(res);
  return json.product;
}

export async function uploadCatalogImage(file) {
  const { prepareCatalogImageFile, fileToDataUrl } = await import(
    '@/lib/imageUploadPrep'
  );
  const prepared = await prepareCatalogImageFile(file);
  const dataUrl = await fileToDataUrl(prepared);

  const res = await crmFetch('/crm/catalog/upload-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  });
  const json = await parseJson(res);
  return json.url || json.photoPreviewUrl || '';
}
