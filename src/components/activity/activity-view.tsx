"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Undo2, Cog } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/user-avatar";
import { StatusBadge, PriorityBadge } from "@/components/shared/badges";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import { revertChange } from "@/app/actions/audit";
import type { AuditLogDTO } from "@/lib/types";

const AGENT_KEY: Record<string, string> = {
  Planning: "agentPlanning",
  Monitoring: "agentMonitoring",
  Reporting: "agentReporting",
  Communication: "agentCommunication",
  Data: "agentData",
  Assignment: "agentAssignment",
};

// Fields whose before→after change is worth surfacing in the diff.
const DIFF_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "assignee",
  "startDate",
  "dueDate",
  "estimatedHours",
  "dependencies",
] as const;

type Filter = "all" | "user" | "agent";

export function ActivityView({
  entries,
  canRevert,
}: {
  entries: AuditLogDTO[];
  canRevert: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(
    () => entries.filter((e) => filter === "all" || e.actorKind === filter),
    [entries, filter],
  );

  const actorName = (e: AuditLogDTO) => {
    if (e.actorKind === "agent") {
      const key = AGENT_KEY[e.actorLabel];
      return key ? (t.ai as Record<string, string>)[key] : e.actorLabel;
    }
    if (e.actorKind === "system") return t.activity.system;
    return e.actorLabel;
  };

  const doRevert = (id: string) => {
    setConfirmingId(null);
    setRevertingId(id);
    startTransition(async () => {
      const res = await revertChange(id);
      setRevertingId(null);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t.activity.filterAll },
    { key: "user", label: t.activity.filterUsers },
    { key: "agent", label: t.activity.filterAgents },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.activity.title}</h1>
          <p className="text-sm text-muted-foreground">{t.activity.subtitle}</p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {t.activity.empty}
        </Card>
      ) : (
        <Card className="divide-y p-0">
          {shown.map((e) => (
            <ActivityRow
              key={e.id}
              entry={e}
              actorName={actorName(e)}
              canRevert={canRevert}
              reverting={revertingId === e.id && pending}
              confirming={confirmingId === e.id}
              disabled={pending}
              onRequestRevert={() => setConfirmingId(e.id)}
              onCancelRevert={() => setConfirmingId(null)}
              onConfirmRevert={() => doRevert(e.id)}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function ActorMarker({ entry, name }: { entry: AuditLogDTO; name: string }) {
  if (entry.actorKind === "user") {
    return <UserAvatar name={name} className="size-9" />;
  }
  const isAgent = entry.actorKind === "agent";
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full",
        isAgent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {isAgent ? <Sparkles className="size-4" /> : <Cog className="size-4" />}
    </span>
  );
}

function ActivityRow({
  entry,
  actorName,
  canRevert,
  reverting,
  confirming,
  disabled,
  onRequestRevert,
  onCancelRevert,
  onConfirmRevert,
}: {
  entry: AuditLogDTO;
  actorName: string;
  canRevert: boolean;
  reverting: boolean;
  confirming: boolean;
  disabled: boolean;
  onRequestRevert: () => void;
  onCancelRevert: () => void;
  onConfirmRevert: () => void;
}) {
  const { t } = useI18n();
  const actionLabel =
    (t.auditAction as Record<string, string>)[entry.action] ?? entry.action;

  const diff = computeDiff(entry);

  return (
    <div className="flex gap-3 p-4">
      <ActorMarker entry={entry} name={actorName} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm leading-snug">
          <span className="font-medium">{actorName}</span>{" "}
          <span className="text-muted-foreground">{actionLabel}</span>
          {entry.entityTitle && (
            <>
              {" "}
              <span className="font-medium">«{entry.entityTitle}»</span>
            </>
          )}
        </p>

        {diff.length > 0 && (
          <div className="space-y-1 pt-1">
            {diff.map((d) => (
              <div
                key={d.key}
                className="flex flex-wrap items-center gap-1.5 text-xs"
              >
                <span className="text-muted-foreground">
                  {(t.auditField as Record<string, string>)[d.key] ?? d.key}:
                </span>
                <DiffValue field={d.key} value={d.before} />
                <span className="text-muted-foreground">→</span>
                <DiffValue field={d.key} value={d.after} />
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {formatDateTime(entry.timestamp)}
        </p>
      </div>

      {canRevert && entry.revertible && (
        <div className="flex shrink-0 items-center gap-1 self-start">
          {reverting ? (
            <span className="px-2 text-xs text-muted-foreground">
              {t.activity.reverting}
            </span>
          ) : confirming ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onConfirmRevert}
                disabled={disabled}
                title={t.activity.revertConfirm}
              >
                <Undo2 className="size-3.5" />
                {t.common.confirm}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={onCancelRevert}
                disabled={disabled}
              >
                {t.common.cancel}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onRequestRevert}
              disabled={disabled}
            >
              <Undo2 className="size-3.5" />
              <span className="hidden sm:inline">{t.activity.revert}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

type DiffRow = { key: string; before: unknown; after: unknown };

/** Fields that differ between the before and after snapshots of an update. */
function computeDiff(entry: AuditLogDTO): DiffRow[] {
  const { before, after } = entry;
  if (!before || !after) return [];
  const rows: DiffRow[] = [];
  for (const key of DIFF_FIELDS) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) {
      rows.push({ key, before: b, after: a });
    }
  }
  return rows;
}

function DiffValue({ field, value }: { field: string; value: unknown }) {
  const { t } = useI18n();
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground italic">{t.common.none}</span>;
  }
  if (field === "status") return <StatusBadge status={String(value)} />;
  if (field === "priority") return <PriorityBadge priority={String(value)} />;
  if (field === "startDate" || field === "dueDate") {
    return <span className="font-medium">{formatDate(String(value))}</span>;
  }
  return <span className="font-medium">{String(value)}</span>;
}
