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

// The lines of a JSON reply, or null when the reply was not that shape.
function readLines(reply: unknown): string[] | null {
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
  const lines = (value as { lines?: unknown } | null)?.lines;
  return Array.isArray(lines) && lines.every((line) => typeof line === "string") ? lines : null;
}

// Subtitle lines from one language into another, one for one. Null means the reply did not keep the lines in step, and the
// caller asks again in smaller batches.
export async function translateLines(lines: string[], from: string, to: string): Promise<string[] | null> {
  const messages = [
    {
      role: "system",
      content:
        `You translate film subtitles from ${nameOf(from)} into ${nameOf(to)}. Translate every line, keeping its meaning, names and ` +
        `tone, and keep lines short, as subtitles are. Answer with JSON only, in the form {"lines": [...]}, holding exactly one ` +
        `translated line for each line given, in the same order.`,
    },
    { role: "user", content: JSON.stringify({ lines }) },
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
  return readLines(result.choices?.[0]?.message?.content ?? result.response ?? null);
}
