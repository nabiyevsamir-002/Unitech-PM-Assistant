"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/providers/i18n-provider";
import { logTime, deleteTimeLog, listTimeLogs } from "@/app/actions/time";
import { formatDate } from "@/lib/format";
import type { TimeLogDTO } from "@/lib/types";

export function TimeLogPanel({
  taskId,
  estimatedHours,
}: {
  taskId: string;
  estimatedHours: number | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [logs, setLogs] = useState<TimeLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  useEffect(() => {
    let active = true;
    listTimeLogs(taskId).then((l) => {
      if (active) {
        setLogs(l);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [taskId]);

  const total = logs.reduce((s, l) => s + l.hours, 0);

  const submit = () => {
    const h = Number(hours);
    if (!h || h <= 0) {
      toast.error(t.time.hours);
      return;
    }
    startTransition(async () => {
      const res = await logTime({ taskId, hours: h, date, note: note || null });
      if (res.ok) {
        toast.success(res.message);
        setHours("");
        setNote("");
        setLogs(await listTimeLogs(taskId));
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteTimeLog(id);
      if (res.ok) {
        setLogs((prev) => prev.filter((x) => x.id !== id));
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5">
          <Clock className="size-4 text-primary" />
          <span className="font-semibold tabular-nums">{total}s</span>
          <span className="text-muted-foreground">{t.time.loggedHours}</span>
        </span>
        {estimatedHours != null && (
          <span className="text-muted-foreground">
            / {estimatedHours}s {t.time.estimated}
          </span>
        )}
      </div>

      {/* Log form */}
      <div className="grid grid-cols-[80px_1fr_auto] items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t.time.hours}</Label>
          <Input
            type="number"
            min={0}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="2"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t.time.note}</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.time.note}
          />
        </div>
        <Button onClick={submit} disabled={pending}>
          <Plus className="size-4" />
          {t.time.log}
        </Button>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t.time.date}</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Entries */}
      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t.common.loading}
        </p>
      ) : logs.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          {t.time.empty}
        </p>
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-12 font-semibold tabular-nums">{l.hours}s</span>
              <span className="w-24 text-xs text-muted-foreground">
                {formatDate(l.date)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {l.note || <span className="text-muted-foreground">—</span>}
              </span>
              <span className="text-xs text-muted-foreground">{l.userName}</span>
              <button
                onClick={() => remove(l.id)}
                disabled={pending}
                className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
