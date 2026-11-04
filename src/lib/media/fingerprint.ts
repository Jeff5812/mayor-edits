// Duplicate detection without reading whole videos into memory: file size plus a SHA-256 of the
// first and last 2 MB. Only the two slices are ever read.
export const FINGERPRINT_SLICE_BYTES = 2 * 1024 * 1024;

export async function hashSlices(size: number, head: BufferSource, tail: BufferSource): Promise<string> {
  const headBytes = toBytes(head);
  const tailBytes = toBytes(tail);
  const joined = new Uint8Array(headBytes.length + tailBytes.length);
  joined.set(headBytes, 0);
  joined.set(tailBytes, headBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", joined);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `v1:${size}:${hex}`;
}

function toBytes(source: BufferSource): Uint8Array {
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

export async function fingerprintFile(file: Blob): Promise<string> {
  const head = await file.slice(0, FINGERPRINT_SLICE_BYTES).arrayBuffer();
  const tail = await file.slice(Math.max(0, file.size - FINGERPRINT_SLICE_BYTES), file.size).arrayBuffer();
  return hashSlices(file.size, head, tail);
}
