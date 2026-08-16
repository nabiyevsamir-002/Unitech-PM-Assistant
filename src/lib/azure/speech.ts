// Azure Speech Services (TTS + STT). Credential-gated: fully no-ops until
// AZURE_SPEECH_KEY + AZURE_SPEECH_REGION are set, so nothing breaks without a
// key — the app then falls back to the browser's Web Speech API. Get these from
// the Azure portal → your Speech resource → "Keys and Endpoint" (KEY 1 +
// Location/Region, e.g. "westeurope").
//
// Privacy note: unlike the rest of the app (local Ollama), calling Azure sends
// microphone audio (STT) and answer text (TTS) to Microsoft's cloud. This is a
// deliberate, opt-in trade for real Azerbaijani neural voices.

const KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION;
// Native Azerbaijani neural voices: az-AZ-BanuNeural (female), az-AZ-BabekNeural (male).
const TTS_VOICE = process.env.AZURE_TTS_VOICE || "az-AZ-BanuNeural";

export function isAzureSpeechConfigured(): boolean {
  return !!(KEY && REGION);
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Synthesize speech from text via the Azure TTS REST endpoint. Returns MP3
 * bytes, or null when unconfigured / on failure. `lang` selects the voice locale.
 */
export async function azureTts(
  text: string,
  lang: "az" | "en" = "az",
): Promise<ArrayBuffer | null> {
  if (!KEY || !REGION) return null;
  const trimmed = text.slice(0, 5000); // guard against very large inputs
  const voice = lang === "en" ? "en-US-JennyNeural" : TTS_VOICE;
  const locale = lang === "en" ? "en-US" : "az-AZ";
  const ssml =
    `<speak version='1.0' xml:lang='${locale}'>` +
    `<voice xml:lang='${locale}' name='${voice}'>${xmlEscape(trimmed)}</voice>` +
    `</speak>`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(
      `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "unitech-pm",
        },
        body: ssml,
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Transcribe a short WAV clip (PCM 16 kHz mono) via the Azure STT REST endpoint.
 * Returns the recognized text, or null when unconfigured / on failure.
 */
export async function azureStt(
  audio: ArrayBuffer,
  lang: "az" | "en" = "az",
): Promise<string | null> {
  if (!KEY || !REGION) return null;
  const language = lang === "en" ? "en-US" : "az-AZ";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(
      `https://${REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": KEY,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json",
        },
        body: audio,
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      DisplayText?: string;
      RecognitionStatus?: string;
    };
    if (data.RecognitionStatus !== "Success") return null;
    return data.DisplayText ?? null;
  } catch {
    return null;
  }
}
