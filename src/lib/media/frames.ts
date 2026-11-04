// Browser only. Reads duration and poster frames through an object URL in a detached video element,
// so the file is never loaded into memory. Every object URL is revoked when the work finishes.
import { POSTER_MAX_BYTES, POSTER_TARGET_BYTES, fitWithin } from "./validation";

export class UndecodableVideoError extends Error {
  constructor() {
    super("This browser cannot decode this video.");
    this.name = "UndecodableVideoError";
  }
}

const DECODE_TIMEOUT_MS = 20_000;

async function withVideo<T>(file: Blob, work: (video: HTMLVideoElement) => Promise<T>): Promise<T> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new UndecodableVideoError()), DECODE_TIMEOUT_MS);
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
    URL.revokeObjectURL(url);
  }
}

// Null means the browser could not read the file, which is common for some MOV codecs.
export async function readVideoDuration(file: Blob): Promise<number | null> {
  try {
    return await withVideo(file, async (video) =>
      Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null,
    );
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

function drawToCanvas(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): HTMLCanvasElement {
  const { width, height } = fitWithin(sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create images.");
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

// Grabs one frame as a JPEG, at most 1600px wide and light enough for the portfolio grid.
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

    return encodePoster(drawToCanvas(video, video.videoWidth, video.videoHeight));
  });
}

// Custom posters are kept as they are when they are already light enough, and redrawn when they are not.
export async function preparePosterImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be read. Please choose another one."));
      image.src = url;
    });
    const withinWidth = image.naturalWidth <= fitWithin(image.naturalWidth, image.naturalHeight).width;
    if (withinWidth && file.size <= POSTER_TARGET_BYTES) return file;
    return await encodePoster(drawToCanvas(image, image.naturalWidth, image.naturalHeight));
  } finally {
    URL.revokeObjectURL(url);
  }
}
