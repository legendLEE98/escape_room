const MAX_SIDE = 1600; // longest edge after downscaling
const MAX_BYTES = 900 * 1024; // the server refuses anything over 1MB

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Shrinks the picked image and re-encodes it as WebP so it fits the server's
// limit no matter what the user picked (phone photos are several MB).
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await toBlob(canvas, 'image/webp', quality);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error('이미지가 너무 큽니다. 더 작은 이미지를 골라 주세요.');
}

// Uploads an image and returns the URL to store (e.g. /api/uploads/<uuid>.webp).
export async function uploadImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다.');
  let blob;
  try {
    blob = await shrink(file);
  } catch (error) {
    throw error.message.startsWith('이미지가') ? error : new Error('이미지를 읽을 수 없습니다.');
  }

  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '이미지 업로드에 실패했습니다.');
  return data.url;
}
