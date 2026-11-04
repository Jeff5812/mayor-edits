// How a video is cut up for upload. Pure, and shared by the browser and the server so both always agree.
// R2 requires every part except the last to be the same size, and at least 5 MiB.
export const UPLOAD_PART_BYTES = 8 * 1024 * 1024;

export function partCount(fileSize: number): number {
  return Math.ceil(fileSize / UPLOAD_PART_BYTES);
}

// Byte range of one part. Parts are numbered from 1, as S3 and R2 number them.
export function partRange(fileSize: number, partNumber: number): { start: number; end: number } {
  const start = (partNumber - 1) * UPLOAD_PART_BYTES;
  return { start, end: Math.min(start + UPLOAD_PART_BYTES, fileSize) };
}

export function partSize(fileSize: number, partNumber: number): number {
  const { start, end } = partRange(fileSize, partNumber);
  return end - start;
}
