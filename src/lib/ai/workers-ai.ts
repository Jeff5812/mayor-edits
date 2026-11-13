import "server-only";

// Cloudflare Workers AI, on the same Cloudflare account as video storage: Whisper hears speech and writes timed text, and
// Gemma translates it. Both have a free daily allowance (see docs/ARCHITECTURE.md). Needs CLOUDFLARE_AI_TOKEN, a token
// allowed to use Workers AI. Without it, automatic subtitles stay switched off and nothing else changes.
const SPEECH_MODEL = "@cf/openai/whisper-large-v3-turbo";
const TRANSLATION_MODEL = "@cf/google/gemma-4-26b-a4b-it";

export function isAiConfigured(): boolean {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.CLOUDFLARE_AI_TOKEN);
}

class AiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

// Cloudflare's answer once the day's free allowance of neurons is spent. It renews at midnight UTC.
export function isAllowanceSpent(error: unknown): boolean {
  return error instanceof AiError && error.status === 429 && /neuron|daily|free allocation/i.test(error.message);
}

async function run<T>(model: string, input: unknown, timeoutMs: number): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.R2_ACCOUNT_ID}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_AI_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await response.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { message?: string }[] } | null;
  if (!response.ok || !body?.success || body.result === undefined) {
    throw new AiError(response.status, body?.errors?.[0]?.message ?? `Workers AI answered ${response.status}`);
  }
  return body.result;
}

export interface HeardPiece {
  language: string | null;
  segments: { start: number; end: number; text: string }[];
}

// One piece of sound, as 16-bit WAV, to timed text. Once the language is known it is passed in, so every piece agrees.
export async function hearSpeech(wav: ArrayBuffer, options: { language?: string; prompt?: string }): Promise<HeardPiece> {
  const result = await run<{ segments?: HeardPiece["segments"]; transcription_info?: { language?: string } }>(
    SPEECH_MODEL,
    {
      audio: Buffer.from(wav).toString("base64"),
      task: "transcribe",
      // Skips silence and music, where Whisper is most likely to invent words.
      vad_filter: true,
      ...(options.language ? { language: options.language } : {}),
      ...(options.prompt ? { initial_prompt: options.prompt } : {}),
    },
    50_000,
  );
  return {
    language: result.transcription_info?.language ?? null,
    segments: (result.segments ?? []).map(({ start, end, text }) => ({ start, end, text })),
  };
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
const nameOf = (code: string) => languageNames.of(code) ?? code;

// The translated lines of a reply, by their numbers. A line the reply left out is null, and a reply with none at all is null.
function readLines(reply: unknown, count: number): (string | null)[] | null {
  let value = reply;
  if (typeof reply === "string") {
    const start = reply.indexOf("{");
    const end = reply.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      value = JSON.parse(reply.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  // Some replies wrap the answer, as {"lines": ...}.
  const answer = (value as { lines?: unknown }).lines ?? value;
  if (Array.isArray(answer)) return answer.length === count && answer.every((line) => typeof line === "string") ? (answer as string[]) : null;
  if (!answer || typeof answer !== "object") return null;
  const numbered = answer as Record<string, unknown>;
  const lines = Array.from({ length: count }, (_, index) => {
    const line = numbered[String(index + 1)];
    return typeof line === "string" && line.trim() ? line : null;
  });
  return lines.some((line) => line !== null) ? lines : null;
}

// Subtitle lines from one language into another. The lines go out numbered and come back by number, so a reply that merges two
// pieces of a sentence cannot shift every line after it. A line missing from the reply is null, and the caller asks again.
export async function translateLines(lines: string[], from: string, to: string): Promise<(string | null)[] | null> {
  const messages = [
    {
      role: "system",
      content:
        `You translate film subtitles from ${nameOf(from)} into ${nameOf(to)}. You are given a JSON object whose keys number the ` +
        `subtitle lines in order. The lines are pieces of running speech, so a sentence often carries on into the next line: ` +
        `translate each piece so that, read in order, they make natural ${nameOf(to)}, keeping names, meaning and tone, and keep ` +
        `each line short. Answer with JSON only: an object with exactly the same keys, each holding the translation of that line.`,
    },
    { role: "user", content: JSON.stringify(Object.fromEntries(lines.map((line, index) => [String(index + 1), line]))) },
  ];
  const plain = { messages, temperature: 0.2, max_completion_tokens: 8192 };
  type Reply = { choices?: { message?: { content?: string } }[]; response?: unknown };
  let result: Reply;
  try {
    // JSON only, and no thinking aloud first, which would spend the answer's length on something else.
    result = await run<Reply>(TRANSLATION_MODEL, { ...plain, response_format: { type: "json_object" }, chat_template_kwargs: { enable_thinking: false } }, 55_000);
  } catch (error) {
    // A model that refuses those settings still follows the instructions above.
    if (!(error instanceof AiError) || error.status !== 400) throw error;
    result = await run<Reply>(TRANSLATION_MODEL, plain, 55_000);
  }
  return readLines(result.choices?.[0]?.message?.content ?? result.response ?? null, lines.length);
}
