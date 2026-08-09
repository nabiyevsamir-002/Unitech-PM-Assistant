"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, AlertCircle } from "lucide-react";
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

type ChatMessage = { role: "user" | "assistant"; content: string };

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Health check when the panel opens.
  useEffect(() => {
    if (!open) return;
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setAiOnline(!!d.online))
      .catch(() => setAiOnline(false));
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
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, lang }),
      });

      if (!res.ok || !res.body) {
        throw new Error("no stream");
      }

      const created = res.headers.get("X-Approvals-Created");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

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
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: t.ai.disabled,
        };
        return copy;
      });
      setAiOnline(false);
    } finally {
      setBusy(false);
    }
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
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4.5" />
            </span>
            {t.ai.assistant}
            {aiOnline === false && (
              <span className="ml-auto flex items-center gap-1 text-xs font-normal text-destructive">
                <AlertCircle className="size-3.5" />
                {t.settings.aiOffline}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto thin-scrollbar px-5 py-5"
        >
          {messages.length === 0 && (
            <div className="rounded-xl border bg-accent/40 p-4 text-sm text-accent-foreground">
              {t.ai.greeting}
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start",
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
            </div>
          ))}
        </div>

        <div className="border-t p-3">
          <div className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t.ai.placeholder}
              rows={2}
              className="resize-none pr-12"
              disabled={busy}
            />
            <Button
              size="icon"
              className="absolute right-2 bottom-2 size-8"
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label={t.ai.send}
            >
              <Send className="size-4" />
            </Button>
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
