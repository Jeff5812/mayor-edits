// Browser only. Reads duration and poster frames in a detached video element: from a local file through an object URL, so the
// file is never loaded into memory, or from a stored video's link. Every object URL is revoked when the work finishes.
import { POSTER_MAX_BYTES, POSTER_TARGET_BYTES, isThumbnailShape, thumbnailCrop } from "./validation";

export class UndecodableVideoError extends Error {
  constructor() {
    super("This browser cannot decode this video.");
    this.name = "UndecodableVideoError";
  }
}

const DECODE_TIMEOUT_MS = 20_000;
// A stored video's index has to come over the connection first, which takes a while on a slow line.
const STORED_TIMEOUT_MS = 90_000;

async function withVideo<T>(source: Blob | string, work: (video: HTMLVideoElement) => Promise<T>, timeoutMs = DECODE_TIMEOUT_MS): Promise<T> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new UndecodableVideoError()), timeoutMs);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new UndecodableVideoError());
      };
      video.src = url;
    });
    return await work(video);
  } finally {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute("src");
    video.load();
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

const durationOf = async (video: HTMLVideoElement) => (Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null);

// Null means the browser could not read the file, which is common for some MOV codecs.
export async function readVideoDuration(file: Blob): Promise<number | null> {
  try {
    return await withVideo(file, durationOf);
  } catch {
    return null;
  }
}

// The running time of a stored video, from its link. Only the start of the file is fetched, where an MP4 keeps its index.
export async function readStoredVideoDuration(url: string): Promise<number | null> {
  try {
    return await withVideo(url, durationOf, STORED_TIMEOUT_MS);
  } catch {
    return null;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image could not be created."))), type, quality);
  });
}

// Steps the quality down until the image is light enough for a page full of cards.
async function encodePoster(canvas: HTMLCanvasElement): Promise<Blob> {
  let smallest: Blob | null = null;
  for (const quality of [0.82, 0.72, 0.6, 0.5]) {
    smallest = await canvasToBlob(canvas, "image/jpeg", quality);
    if (smallest.size <= POSTER_TARGET_BYTES) return smallest;
  }
  if (smallest && smallest.size <= POSTER_MAX_BYTES) return smallest;
  throw new Error("The image is still over the 5 MB limit after compressing it. Please choose a simpler image.");
}

// The 16:9 middle of a picture, at thumbnail size (see thumbnailCrop).
function drawThumbnail(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): HTMLCanvasElement {
  const crop = thumbnailCrop(sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create images.");
  context.imageSmoothingQuality = "high";
  context.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.width, crop.height);
  return canvas;
}

// The frame a video is showing now, as a 16:9 JPEG thumbnail light enough for a page full of cards.
export async function thumbnailFromVideo(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) throw new UndecodableVideoError();
  return encodePoster(drawThumbnail(video, video.videoWidth, video.videoHeight));
}

// Grabs one frame of a file as a thumbnail, by default a little way in, past any fade from black.
export async function captureVideoFrame(file: Blob, atSeconds?: number): Promise<Blob> {
  return withVideo(file, async (video) => {
    if (!video.videoWidth || !video.videoHeight) throw new UndecodableVideoError();
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = atSeconds ?? Math.min(duration * 0.1, 5);
    video.preload = "auto";

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new UndecodableVideoError()), DECODE_TIMEOUT_MS);
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new UndecodableVideoError());
      };
      video.onseeked = () => {
        window.clearTimeout(timer);
        video.onseeked = null;
        resolve();
      };
      video.currentTime = Math.max(0, Math.min(target, Math.max(0, duration - 0.05)));
    });

    return thumbnailFromVideo(video);
  });
}

// An image the owner chose as a thumbnail, with the size it came in: kept as it is when it is already 16:9 and light enough,
// and otherwise cropped to its 16:9 middle and redrawn at up to 1280 x 720, so every card on the reel has the same shape.
export async function prepareThumbnailImage(file: File): Promise<{ image: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be read. Please choose another one."));
      image.src = url;
    });
    const { naturalWidth: width, naturalHeight: height } = image;
    if (isThumbnailShape(width, height) && file.size <= POSTER_TARGET_BYTES) return { image: file, width, height };
    return { image: await encodePoster(drawThumbnail(image, width, height)), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
