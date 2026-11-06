import { BrandMark } from "./BrandMark";

// Words from the cutting room, not a list of services, so this promises nothing the studio has not said.
const WORDS = ["Cut", "Pace", "Story", "Rhythm", "Frame", "Mood", "Timing", "Flow"];

function Run() {
  return (
    <div className="film-run">
      {WORDS.map((word, index) => (
        <span key={word} className="contents">
          <span className={index % 2 === 0 ? "film-word" : "film-word film-word-outline"}>{word}</span>
          <BrandMark width="22" height="22" className="shrink-0 text-ember/70" />
        </span>
      ))}
    </div>
  );
}

// A strip of film running slowly across the page. Decorative, and it holds still while the pointer is on it. Two
// identical runs side by side make the loop seamless, in CSS alone.
export function FilmStrip() {
  return (
    <div aria-hidden="true" className="film-strip">
      <div className="film-track">
        <Run />
        <Run />
      </div>
    </div>
  );
}
