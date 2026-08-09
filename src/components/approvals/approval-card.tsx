"use client";

import { useState, useTransition } from "react";
import {
  Check,
  X,
  Pencil,
  Bot,
  ArrowRight,
  Mail,
  CalendarClock,
  UserPlus,
  UserCheck,
  FileSpreadsheet,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/badges";
import { useI18n } from "@/components/providers/i18n-provider";
import { decideApproval } from "@/app/actions/approvals";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ApprovalDTO } from "@/lib/types";

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  CHANGE_DEADLINE: CalendarClock,
  ASSIGN_TASK: UserPlus,
  CHANGE_STATUS: ArrowRight,
  SEND_MESSAGE: Mail,
  EXCEL_WRITE: FileSpreadsheet,
  CREATE_TASK: Plus,
  APPROVE_USER: UserCheck,
};

export function ApprovalCard({
  approval,
  canApprove,
  highlighted = false,
}: {
  approval: ApprovalDTO;
  canApprove: boolean;
  highlighted?: boolean;
}) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [editedPayload, setEditedPayload] = useState<Record<string, unknown>>(
    approval.payload,
  );

  const Icon = TYPE_ICON[approval.type] ?? Bot;
  const typeLabel =
    (t.approvalType as Record<string, string>)[approval.type] ?? approval.type;
  const decided = approval.status !== "PENDING";

  const run = (
    decision: "APPROVED" | "REJECTED",
    opts?: { editedPayload?: Record<string, unknown>; reason?: string },
  ) => {
    startTransition(async () => {
      const res = await decideApproval(approval.id, decision, opts);
      if (res.ok) {
        toast.success(
          decision === "APPROVED"
            ? `${t.approvals.approvedToast}${res.message ? " — " + res.message : ""}`
            : t.approvals.rejectedToast,
        );
      } else {
        toast.error(res.message);
      }
      setEditOpen(false);
      setRejectOpen(false);
    });
  };

  return (
    <Card
      className={
        highlighted
          ? "border-primary/40 bg-primary/[0.03] shadow-sm"
          : undefined
      }
    >
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                <Bot className="size-3" />
                {approval.proposedByAgent}
              </span>
              <span className="text-xs text-muted-foreground">{typeLabel}</span>
              {decided && <StatusBadge status={approval.status} />}
            </div>
            <h3 className="mt-1.5 text-sm font-semibold">{approval.title}</h3>
            {approval.summary && (
              <p className="mt-1 text-sm text-muted-foreground">
                {approval.summary}
              </p>
            )}
          </div>
        </div>

        <PayloadPreview type={approval.type} payload={approval.payload} />

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {t.approvals.requestedAt}: {formatDateTime(approval.requestedAt)}
          </span>

          {!decided && canApprove && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setRejectOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <X className="size-4" />
                {t.approvals.reject}
              </Button>
              {approval.type !== "APPROVE_USER" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="size-4" />
                  {t.approvals.editAndApprove}
                </Button>
              )}
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run("APPROVED")}
              >
                <Check className="size-4" />
                {t.approvals.approve}
              </Button>
            </div>
          )}

          {!decided && !canApprove && (
            <span className="text-xs text-muted-foreground italic">
              {t.approvals.noPermission}
            </span>
          )}

          {decided && approval.decidedByName && (
            <span className="text-xs text-muted-foreground">
              {t.approvals.decidedBy}: {approval.decidedByName}
            </span>
          )}
        </div>
      </CardContent>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.approvals.reject}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">{t.approvals.rejectReason}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run("REJECTED", { reason })}
            >
              {t.approvals.reject}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit & approve dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.approvals.editAndApprove}</DialogTitle>
          </DialogHeader>
          <PayloadEditor
            payload={editedPayload}
            onChange={setEditedPayload}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              disabled={pending}
              onClick={() => run("APPROVED", { editedPayload })}
            >
              <Check className="size-4" />
              {t.approvals.approve}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 font-medium break-words">{value}</span>
    </div>
  );
}

function PayloadPreview({
  type,
  payload,
}: {
  type: string;
  payload: Record<string, unknown>;
}) {
  const s = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");

  if (type === "APPROVE_USER") {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{s("name")}</p>
          <p className="truncate text-xs text-muted-foreground">{s("email")}</p>
        </div>
      </div>
    );
  }

  if (type === "SEND_MESSAGE") {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-xs">
        <KV label="Kimə" value={s("to")} />
        <KV label="Mövzu" value={s("subject")} />
        <div className="mt-2 border-t pt-2 whitespace-pre-wrap text-muted-foreground">
          {s("body")}
        </div>
      </div>
    );
  }

  if (type === "CHANGE_DEADLINE") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="font-medium">{s("title")}</span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-muted-foreground line-through">
            {formatDate(s("from"))}
          </span>
          <ArrowRight className="size-3.5" />
          <span className="font-semibold text-primary">{formatDate(s("to"))}</span>
        </span>
      </div>
    );
  }

  if (type === "EXCEL_WRITE") {
    const preview = Array.isArray(payload.preview)
      ? (payload.preview as {
          field: string;
          label: string;
          sheet: string;
          cell: string;
          current: unknown;
          next: unknown;
          changed: boolean;
        }[])
      : [];
    const changed = preview.filter((p) => p.changed);
    const fmtCell = (v: unknown) => {
      if (v == null || v === "") return "—";
      const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v);
    };
    return (
      <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-xs">
        {changed.map((p) => (
          <div key={p.field} className="flex items-center gap-2">
            <span className="flex-1 truncate">{p.label}</span>
            <span className="rounded bg-background px-1.5 py-0.5 font-mono">
              {p.sheet}!{p.cell}
            </span>
            <span className="text-muted-foreground line-through">
              {fmtCell(p.current)}
            </span>
            <ArrowRight className="size-3" />
            <span className="font-semibold text-primary">{fmtCell(p.next)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === "ASSIGN_TASK" || type === "CHANGE_STATUS") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="font-medium">{s("title")}</span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-muted-foreground line-through">{s("from")}</span>
          <ArrowRight className="size-3.5" />
          <span className="font-semibold text-primary">{s("to")}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
      {Object.entries(payload).map(([k, v]) => (
        <KV key={k} label={k} value={String(v)} />
      ))}
    </div>
  );
}

function PayloadEditor({
  payload,
  onChange,
}: {
  payload: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const set = (k: string, v: string) => onChange({ ...payload, [k]: v });
  const has = (k: string) => typeof payload[k] === "string";

  return (
    <div className="space-y-3">
      {has("to") && (
        <div className="space-y-1.5">
          <Label>Kimə / Dəyər</Label>
          <Input
            value={String(payload.to ?? "")}
            onChange={(e) => set("to", e.target.value)}
          />
        </div>
      )}
      {has("subject") && (
        <div className="space-y-1.5">
          <Label>Mövzu</Label>
          <Input
            value={String(payload.subject ?? "")}
            onChange={(e) => set("subject", e.target.value)}
          />
        </div>
      )}
      {has("body") && (
        <div className="space-y-1.5">
          <Label>Mətn</Label>
          <Textarea
            rows={6}
            value={String(payload.body ?? "")}
            onChange={(e) => set("body", e.target.value)}
          />
        </div>
      )}
      {!has("to") && !has("body") && (
        <p className="text-sm text-muted-foreground">
          Bu əməliyyat üçün redaktə sahəsi yoxdur.
        </p>
      )}
    </div>
  );
}
