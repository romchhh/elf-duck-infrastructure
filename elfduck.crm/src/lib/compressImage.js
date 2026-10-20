/**
 * Стискає зображення перед upload (canvas), щоб не ловити nginx 413.
 * Повертає File (jpeg/png/webp).
 */
export async function compressImageForUpload(file, options = {}) {
  const maxEdge = Number(options.maxEdge || 1920);
  const maxBytes = Number(options.maxBytes || 2.5 * 1024 * 1024);
  const qualityStart = Number(options.quality || 0.85);

  if (!(file instanceof Blob)) {
    return file;
  }

  // Дрібні файли не чіпаємо
  if (file.size <= Math.min(maxBytes, 900 * 1024)) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const preferPng = file.type === 'image/png';
    const mime = preferPng ? 'image/png' : 'image/jpeg';
    let quality = qualityStart;
    let blob = null;

    for (let i = 0; i < 6; i += 1) {
      blob = await new Promise((resolve) => {
        if (mime === 'image/png') {
          canvas.toBlob(resolve, 'image/png');
        } else {
          canvas.toBlob(resolve, 'image/jpeg', quality);
        }
      });
      if (!blob) break;
      if (blob.size <= maxBytes || mime === 'image/png') break;
      quality = Math.max(0.5, quality - 0.1);
    }

    if (!blob) return file;

    const baseName = String(file.name || 'push')
      .replace(/\.[^.]+$/, '')
      .slice(0, 80);
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    return new File([blob], `${baseName}.${ext}`, {
      type: mime,
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close?.();
  }
}
