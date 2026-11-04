// Display helpers shared by the public site and the admin. No browser or server dependencies.

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

// Player clock: 0:05, 12:40, 1:02:09.
export function formatClock(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

// Accepts "90", "1:30" or "1:02:30". Returns seconds, null for empty input, NaN when invalid.

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "Estimating time";
  if (seconds < 5) return "A few seconds left";
  if (seconds < 60) return `About ${Math.ceil(seconds / 5) * 5} seconds left`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `About ${minutes} minute${minutes === 1 ? "" : "s"} left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `About ${hours} h ${rest} min left`;
}

// Smoothed upload speed, so the estimate does not jump with every 6 MB chunk.
export function nextSpeed(previous: number | null, sample: number, smoothing = 0.25): number {
  if (previous == null || previous <= 0) return sample;
  return previous * (1 - smoothing) + sample * smoothing;
}

export function remainingSeconds(bytesUploaded: number, bytesTotal: number, bytesPerSecond: number | null) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return null;
  return Math.max(0, bytesTotal - bytesUploaded) / bytesPerSecond;
}

export function percentOf(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}
