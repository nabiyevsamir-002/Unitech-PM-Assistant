"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  const langs: Lang[] = ["az", "en"];

  return (
    <div className="flex items-center rounded-md border bg-secondary/50 p-0.5 text-xs font-medium">
      {langs.map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={cn(
            "rounded px-2 py-1 uppercase transition-colors",
            lang === l
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={lang === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
