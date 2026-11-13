// A video's sound, made ready for a speech model: one channel at 16 kHz, in pieces of about half a minute cut where it is
// quiet. Decoding needs a browser. The cutting and the WAV encoding are pure and tested.

export const SPEECH_SAMPLE_RATE = 16_000;
// Whisper reads half a minute at a time, and a piece this long stays inside the 1 MB a server action accepts.
const LONGEST_PIECE_SECONDS = 28;
const SHORTEST_PIECE_SECONDS = 18;
// The cut lands in the quietest 50 ms between the shortest and longest length, so it rarely falls mid-word.
const WINDOW_SECONDS = 0.05;

// Start and end sample of each piece.
export function pieceBounds(
  samples: Float32Array,
  rate = SPEECH_SAMPLE_RATE,
  longest = LONGEST_PIECE_SECONDS,
  shortest = SHORTEST_PIECE_SECONDS,
): Array<[number, number]> {
  const bounds: Array<[number, number]> = [];
  const window = Math.max(1, Math.round(rate * WINDOW_SECONDS));
  let start = 0;
  while (start < samples.length) {
    const end = Math.min(samples.length, start + Math.round(longest * rate));
    if (end === samples.length) {
      bounds.push([start, end]);
      break;
    }
    let cut = end;
    let quietest = Number.POSITIVE_INFINITY;
    for (let at = start + Math.round(shortest * rate); at + window <= end; at += window) {
      let energy = 0;
      for (let index = at; index < at + window; index += 1) energy += samples[index] * samples[index];
      if (energy < quietest) {
        quietest = energy;
        cut = at + Math.floor(window / 2);
      }
    }
    bounds.push([start, cut]);
    start = cut;
  }
  return bounds;
}

// 16-bit PCM WAV, the plainest format every speech model reads.
export function wavBytes(samples: Float32Array, rate = SPEECH_SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}

// Browser only. The whole sound track at 16 kHz, mixed to one channel. The browser resamples while decoding. A long video
// needs a few hundred megabytes of memory for this, which a computer has and a phone may not.
export async function decodeSpeechAudio(source: Blob): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, 1, SPEECH_SAMPLE_RATE);
  const decoded = await context.decodeAudioData(await source.arrayBuffer());
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0);
  const mono = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const data = decoded.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / decoded.numberOfChannels;
  }
  return mono;
}
