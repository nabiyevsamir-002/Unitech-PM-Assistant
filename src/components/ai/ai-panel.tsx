"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Sparkles,
  AlertCircle,
  Target,
  Square,
  Pencil,
  Mic,
  Volume2,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/i18n-provider";
import { listProjectsForAi } from "@/app/actions/projects";
import { startRecording, type Recorder } from "@/lib/azure/record";

type ChatMessage = { role: "user" | "assistant"; content: string };

// Where the conversation is kept so a refresh / tab switch doesn't wipe it.
const CHAT_KEY = "pm-ai-chat-v1";

// Minimal typings for the Web Speech API (not part of the standard DOM lib).
type SpeechResultLike = { 0: { transcript: string }; isFinal: boolean };
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<SpeechResultLike> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function AiPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [focusId, setFocusId] = useState("");
  const [listening, setListening] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [voiceIn, setVoiceIn] = useState(false);
  const [voiceOut, setVoiceOut] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  // Azure Speech (real Azerbaijani voice) when configured; else browser fallback.
  const [azureVoice, setAzureVoice] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationBaseRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  // Bumped on every stop/new play so a slow TTS fetch can't resurrect stale audio.
  const speakTokenRef = useRef(0);
  // Only write to storage after a real user action — never during hydration
  // (otherwise the mount-time effect would clobber the saved chat with []).
  const touchedRef = useRef(false);

  // Detect voice support once (client only).
  useEffect(() => {
    setVoiceIn(!!getSpeechRecognition());
    setVoiceOut(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  // Ask the server whether Azure Speech is configured (no secrets returned). If
  // so, voice uses real Azerbaijani STT/TTS; otherwise the browser Web Speech API.
  useEffect(() => {
    fetch("/api/ai/speech/config")
      .then((r) => r.json())
      .then((d) => setAzureVoice(!!d.configured))
      .catch(() => setAzureVoice(false));
  }, []);

  // Restore the last conversation on load (survives refresh / tab switch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { messages?: ChatMessage[]; focusId?: string };
      if (Array.isArray(saved.messages)) setMessages(saved.messages);
      if (typeof saved.focusId === "string") setFocusId(saved.focusId);
    } catch {
      /* ignore corrupt / unavailable storage */
    }
  }, []);

  // Persist the conversation whenever it settles (drop the mid-stream placeholder).
  useEffect(() => {
    if (busy || !touchedRef.current) return;
    try {
      const clean = messages.filter(
        (m) => !(m.role === "assistant" && m.content === ""),
      );
      localStorage.setItem(CHAT_KEY, JSON.stringify({ messages: clean, focusId }));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [messages, focusId, busy]);

  // Health check + load the project list for the focus picker when the panel opens.
  useEffect(() => {
    if (!open) return;
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setAiOnline(!!d.online))
      .catch(() => setAiOnline(false));
    listProjectsForAi()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [open]);

  // When the panel closes, stop any voice/streaming in progress.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    recognitionRef.current?.stop();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    speakTokenRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeakingIdx(null);
    setListening(false);
    setTranscribing(false);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    touchedRef.current = true;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = "";

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, lang, projectId: focusId || undefined }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("no stream");
      }

      const created = res.headers.get("X-Approvals-Created");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }

      if (created && Number(created) > 0) {
        toast.success(t.ai.proposedApproval);
        router.refresh();
      }
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError";
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          // On a manual stop keep whatever streamed so far; otherwise show the error.
          content: aborted ? acc || t.ai.stopped : t.ai.disabled,
        };
        return copy;
      });
      if (!aborted) setAiOnline(false);
    } finally {
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  const stop = () => abortRef.current?.abort();

  const clearChat = () => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    touchedRef.current = true;
    setSpeakingIdx(null);
    setMessages([]);
    setInput("");
    try {
      localStorage.removeItem(CHAT_KEY);
    } catch {
      /* ignore */
    }
    inputRef.current?.focus();
  };

  // Put a previously-sent message back in the box and drop it + everything after,
  // so the user can edit and re-send.
  const editMessage = (index: number) => {
    if (busy) return;
    touchedRef.current = true;
    setInput(messages[index].content);
    setMessages(messages.slice(0, index));
    inputRef.current?.focus();
  };

  const appendTranscript = (heard: string) => {
    const clean = heard.trim();
    if (!clean) return;
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${clean}` : clean));
  };

  // Azure path: record a WAV clip, then send it to the server to transcribe.
  const toggleAzureDictation = async () => {
    if (listening) {
      const rec = recorderRef.current;
      recorderRef.current = null;
      setListening(false);
      if (!rec) return;
      setTranscribing(true);
      try {
        const wav = await rec.stop();
        const res = await fetch(`/api/ai/stt?lang=${lang}`, {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: wav,
        });
        const data = (await res.json()) as { ok?: boolean; text?: string };
        if (data.ok && data.text) appendTranscript(data.text);
        else toast.error(t.ai.voiceError);
      } catch {
        toast.error(t.ai.voiceError);
      } finally {
        setTranscribing(false);
        inputRef.current?.focus();
      }
      return;
    }
    try {
      recorderRef.current = await startRecording();
      setListening(true);
    } catch {
      toast.error(t.ai.voiceUnsupported);
    }
  };

  const toggleDictation = () => {
    if (azureVoice) {
      void toggleAzureDictation();
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = getSpeechRecognition();
    if (!SR) {
      toast.error(t.ai.voiceUnsupported);
      return;
    }
    const rec = new SR();
    rec.lang = lang === "en" ? "en-US" : "az-AZ";
    rec.interimResults = true;
    rec.continuous = false;
    dictationBaseRef.current = input.trim();
    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error !== "aborted" && e.error !== "no-speech") {
        toast.error(t.ai.voiceError);
      }
    };
    rec.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) {
        heard += e.results[i][0].transcript;
      }
      const base = dictationBaseRef.current;
      setInput(base ? `${base} ${heard}` : heard);
    };
    recognitionRef.current = rec;
    rec.start();
  };

  const stopPlayback = () => {
    speakTokenRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeakingIdx(null);
  };

  // Browser Web Speech fallback (no native Azerbaijani voice → Turkish).
  const browserSpeak = (text: string, token: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      if (token === speakTokenRef.current) setSpeakingIdx(null);
      return;
    }
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const byPrefix = (p: string) =>
      voices.find((v) => v.lang?.toLowerCase().startsWith(p));
    const picked =
      lang === "en" ? byPrefix("en") : byPrefix("az") || byPrefix("tr");
    if (picked) u.voice = picked;
    u.lang = picked?.lang || (lang === "en" ? "en-US" : "az-AZ");
    u.onend = () => {
      if (token === speakTokenRef.current) setSpeakingIdx(null);
    };
    u.onerror = () => {
      if (token === speakTokenRef.current) setSpeakingIdx(null);
    };
    synth.speak(u);
  };

  const speak = async (index: number, text: string) => {
    // Clicking the speaker on the message that is playing stops it.
    if (speakingIdx === index) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const token = ++speakTokenRef.current;
    setSpeakingIdx(index);

    if (azureVoice) {
      try {
        const res = await fetch("/api/ai/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, lang }),
        });
        if (token !== speakTokenRef.current) return; // stopped meanwhile
        if (res.ok) {
          const blob = await res.blob();
          if (token !== speakTokenRef.current) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          const done = () => {
            URL.revokeObjectURL(url);
            if (token === speakTokenRef.current) {
              setSpeakingIdx(null);
              audioRef.current = null;
            }
          };
          audio.onended = done;
          audio.onerror = done;
          await audio.play();
          return;
        }
        // Non-OK (e.g. 503 not configured) → fall through to the browser voice.
      } catch {
        if (token !== speakTokenRef.current) return;
      }
    }
    browserSpeak(text, token);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const lastIsEmptyAssistant =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    messages[messages.length - 1].content === "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md lg:max-w-lg"
        // Focus the message box straight away instead of the close button.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4.5" />
            </span>
            {t.ai.assistant}
            <div className="ml-auto flex items-center gap-3 pr-7">
              {aiOnline === false && (
                <span className="flex items-center gap-1 text-xs font-normal text-destructive">
                  <AlertCircle className="size-3.5" />
                  {t.settings.aiOffline}
                </span>
              )}
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  aria-label={t.ai.clearChat}
                  title={t.ai.clearChat}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        {projects.length > 0 && (
          <div className="flex items-center gap-2 border-b px-5 py-2.5">
            <Target className="size-4 shrink-0 text-muted-foreground" />
            <select
              value={focusId}
              onChange={(e) => {
                touchedRef.current = true;
                setFocusId(e.target.value);
              }}
              className="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t.ai.allProjects}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto thin-scrollbar px-5 py-5"
        >
          {messages.length === 0 && (
            <div className="rounded-xl border bg-accent/40 p-4 text-sm text-accent-foreground">
              {t.ai.greeting}
              {projects.length > 1 && (
                <p className="mt-2 text-xs text-muted-foreground">{t.ai.focusHint}</p>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "group flex flex-col gap-1",
                m.role === "user" ? "items-end" : "items-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border bg-card text-card-foreground",
                )}
              >
                {m.content ||
                  (lastIsEmptyAssistant && i === messages.length - 1 ? (
                    <ThinkingDots label={t.ai.thinking} />
                  ) : null)}
              </div>

              {/* Edit your own message */}
              {m.role === "user" && !busy && (
                <button
                  type="button"
                  onClick={() => editMessage(i)}
                  aria-label={t.ai.edit}
                  title={t.ai.edit}
                  className="flex items-center gap-1 px-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                >
                  <Pencil className="size-3" />
                  {t.ai.edit}
                </button>
              )}

              {/* Read an AI answer aloud */}
              {m.role === "assistant" && m.content && (voiceOut || azureVoice) && (
                <button
                  type="button"
                  onClick={() => speak(i, m.content)}
                  aria-label={speakingIdx === i ? t.ai.stopAudio : t.ai.listen}
                  title={speakingIdx === i ? t.ai.stopAudio : t.ai.listen}
                  className={cn(
                    "flex items-center gap-1 px-1 text-xs transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100",
                    speakingIdx === i
                      ? "text-primary opacity-100"
                      : "text-muted-foreground opacity-0",
                  )}
                >
                  {speakingIdx === i ? (
                    <Square className="size-3 fill-current" />
                  ) : (
                    <Volume2 className="size-3" />
                  )}
                  {speakingIdx === i ? t.ai.stopAudio : t.ai.listen}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t p-3">
          <div className="relative">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t.ai.placeholder}
              rows={2}
              className={cn(
                "resize-none",
                voiceIn || azureVoice ? "pr-20" : "pr-12",
              )}
            />

            {/* Dictate (voice → text) */}
            {(voiceIn || azureVoice) && (
              <Button
                type="button"
                size="icon"
                variant={listening ? "default" : "ghost"}
                className={cn(
                  "absolute right-11 bottom-2 size-8",
                  listening && "animate-pulse",
                )}
                onClick={toggleDictation}
                disabled={busy || transcribing}
                aria-label={listening ? t.ai.dictateStop : t.ai.dictate}
                title={
                  transcribing
                    ? t.ai.transcribing
                    : listening
                      ? t.ai.dictateStop
                      : t.ai.dictate
                }
              >
                {transcribing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
            )}

            {/* Stop while streaming, otherwise send */}
            {busy ? (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="absolute right-2 bottom-2 size-8"
                onClick={stop}
                aria-label={t.ai.stop}
                title={t.ai.stop}
              >
                <Square className="size-4 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="absolute right-2 bottom-2 size-8"
                onClick={send}
                disabled={!input.trim()}
                aria-label={t.ai.send}
                title={t.ai.send}
              >
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ThinkingDots({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 text-muted-foreground">
      <span className="flex gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
      </span>
      {label}
    </span>
  );
}
