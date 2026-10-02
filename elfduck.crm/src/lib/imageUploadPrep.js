const MAX_OUTPUT_BYTES = 9 * 1024 * 1024;
const MAX_EDGE_PX = 2048;

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_LOAD_FAILED'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('ENCODE_FAILED'));
        else resolve(blob);
      },
      type,
      quality
    );
  });
}

/**
 * Зменшує великі PNG/JPEG перед base64-upload (ліміт API ~10 МБ файл, ~14 МБ JSON).
 */
export async function prepareCatalogImageFile(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('INVALID_FILE');
  }

  if (file.size <= 2.5 * 1024 * 1024 && /image\/(jpeg|webp)/i.test(file.type)) {
    return file;
  }

  const img = await loadImageFromFile(file);
  let { width, height } = img;
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height, 1));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const preferWebp = typeof canvas.toBlob === 'function';
  const type = preferWebp ? 'image/webp' : 'image/jpeg';
  const qualities = preferWebp ? [0.88, 0.8, 0.72, 0.64] : [0.9, 0.82, 0.74];

  for (const q of qualities) {
    const blob = await canvasToBlob(canvas, type, q);
    if (blob.size <= MAX_OUTPUT_BYTES) {
      const ext = type === 'image/webp' ? 'webp' : 'jpg';
      const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '');
      return new File([blob], `${baseName}.${ext}`, { type });
    }
  }

  throw new Error('FILE_TOO_LARGE');
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
