const MAX_SIDE = 2000;

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

/**
 * Normalise an uploaded image to PNG/JPEG (the formats pdf-lib can embed).
 * Optionally knocks out a white/light background — handy for photographed signatures.
 */
export async function importImage(
  file: File,
  removeWhite: boolean,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const src = await readAsDataUrl(file);
  const img = await loadImg(src);
  let { naturalWidth: w, naturalHeight: h } = img;
  const embeddable = file.type === 'image/png' || file.type === 'image/jpeg';
  const tooBig = Math.max(w, h) > MAX_SIDE;

  if (embeddable && !removeWhite && !tooBig) return { dataUrl: src, width: w, height: h };

  const k = tooBig ? MAX_SIDE / Math.max(w, h) : 1;
  w = Math.round(w * k);
  h = Math.round(h * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  if (removeWhite) {
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (lum > 225) px[i + 3] = 0;
      else if (lum > 160) px[i + 3] = Math.round(px[i + 3] * ((225 - lum) / 65));
    }
    ctx.putImageData(data, 0, 0);
    return trimTransparent(canvas);
  }
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h };
}

/** Crop a canvas to its non-transparent bounds and return a PNG. */
export function trimTransparent(canvas: HTMLCanvasElement, pad = 4) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const px = ctx.getImageData(0, 0, width, height).data;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { dataUrl: canvas.toDataURL('image/png'), width, height };
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return { dataUrl: out.toDataURL('image/png'), width: w, height: h };
}
