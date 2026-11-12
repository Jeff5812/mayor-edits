// Browser only. Small choices a viewer makes in the player, kept in this browser for the next film: the subtitle language and
// the volume. A browser that refuses storage, as in a private window, simply starts each film with the defaults.
const SUBTITLES = "mayor-edits-subtitles";
const VOLUME = "mayor-edits-volume";

function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Only a convenience, and the choice still applies to this film.
  }
}

// Someone who chose Spanish on one film probably wants it on the next.
export function rememberedSubtitle(): string {
  return get(SUBTITLES) ?? "";
}

export function rememberSubtitle(code: string) {
  set(SUBTITLES, code);
}

// Muting is not carried over, because a film that starts silent can look broken. Nor is a volume turned right down.
export function rememberedVolume(): number {
  const level = Number(get(VOLUME));
  return Number.isFinite(level) && level >= 0.05 && level <= 1 ? level : 1;
}

export function rememberVolume(level: number) {
  if (level >= 0.05) set(VOLUME, level.toFixed(2));
}
