/**
 * Prepares a photo of a signed paper slip for upload: redrawn on a canvas (which drops camera metadata such as the
 * location), at most 1600 px on the long side, saved as a JPEG under about 560 KB.
 */
const MAX_SIDE = 1600;
const MAX_BYTES = 560 * 1024;

export async function prepareSlipPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo (an image file).');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare the photo.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if ((dataUrl.length - 23) * 0.75 <= MAX_BYTES) return dataUrl;
  }
  throw new Error('The photo is too detailed to send. Take it again a little further away.');
}
