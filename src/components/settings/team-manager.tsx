"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, UserX, UserCheck, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleBadge } from "@/components/shared/badges";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { isCurrentlyUnavailable } from "@/lib/format";
import { ROLES } from "@/lib/constants";
import { createUser, updateUser, setUserActive, deleteUser } from "@/app/actions/users";
import { resetUserTotp } from "@/app/actions/totp";
import type { UserDTO } from "@/lib/types";

export function TeamManager({
  members,
  currentUserId,
}: {
  members: UserDTO[];
  currentUserId: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserDTO | null>(null);

  const toggleActive = (m: UserDTO) =>
    startTransition(async () => {
      const res = await setUserActive(m.id, !m.isActive);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const resetTotp = (m: UserDTO) =>
    startTransition(async () => {
      const res = await resetUserTotp(m.id);
      setConfirmReset(null);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const removeMember = (m: UserDTO) =>
    startTransition(async () => {
      const res = await deleteUser(m.id);
      setConfirmDelete(null);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t.settings.manageTeam}</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4" />
          <span className="hidden sm:inline">{t.settings.addMember}</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {members.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2",
              !m.isActive && "opacity-55",
            )}
          >
            <div className="relative">
              <UserAvatar name={m.name} image={m.avatar} className="size-8" />
              <span
                className={cn(
                  "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card",
                  m.isActive ? "bg-success" : "bg-muted-foreground",
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {m.name}
                {!m.isActive && (
                  <span className="text-xs font-normal text-muted-foreground">
                    ({t.settings.inactive})
                  </span>
                )}
                {m.isActive &&
                  isCurrentlyUnavailable(m.unavailableFrom, m.unavailableTo) && (
                    <span className="rounded-full bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      {t.settings.onLeave}
                    </span>
                  )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {m.position || m.email}
              </p>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {m.weeklyCapacityHours}s
            </span>
            <RoleBadge role={m.role} />
            {m.totpEnabled &&
              (confirmReset === m.id ? (
                <button
                  onClick={() => resetTotp(m)}
                  disabled={pending}
                  className="rounded-md px-1.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                  title={t.settings.reset2fa}
                >
                  {t.settings.confirmReset}
                </button>
              ) : (
                <button
                  onClick={() => setConfirmReset(m.id)}
                  disabled={pending}
                  className="rounded-md p-1.5 text-success hover:bg-accent"
                  title={`${t.settings.twoFactorActive} — ${t.settings.reset2fa}`}
                >
                  <ShieldCheck className="size-4" />
                </button>
              ))}
            <button
              onClick={() => setEditing(m)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t.settings.editMember}
            >
              <Pencil className="size-4" />
            </button>
            {m.id !== currentUserId &&
              (m.isActive ? (
                <button
                  onClick={() => toggleActive(m)}
                  disabled={pending}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title={t.settings.deactivate}
                >
                  <UserX className="size-4" />
                </button>
              ) : (
                <button
                  onClick={() => toggleActive(m)}
                  disabled={pending}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-success/10 hover:text-success"
                  title={t.settings.activate}
                >
                  <UserCheck className="size-4" />
                </button>
              ))}
            {m.id !== currentUserId &&
              (confirmDelete === m.id ? (
                <button
                  onClick={() => removeMember(m)}
                  disabled={pending}
                  className="rounded-md px-1.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                  title={t.settings.deleteMember}
                >
                  {t.settings.confirmDelete}
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(m.id)}
                  disabled={pending}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title={t.settings.deleteMember}
                >
                  <Trash2 className="size-4" />
                </button>
              ))}
          </div>
        ))}
      </CardContent>

      <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditMemberDialog
        member={editing}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </Card>
  );
}

function AddMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [capacity, setCapacity] = useState("40");

  const submit = () => {
    startTransition(async () => {
      const res = await createUser({
        name: name.trim(),
        position: position.trim(),
        email: email.trim(),
        role: role as (typeof ROLES)[number],
        weeklyCapacityHours: Number(capacity) || 40,
      });
      if (res.ok) {
        // Temp password only matters if this person will actually sign in.
        toast.success(
          email.trim()
            ? `${res.message} · ${t.settings.tempPassword}: demo1234`
            : res.message,
        );
        onOpenChange(false);
        setName("");
        setPosition("");
        setEmail("");
        setRole("MEMBER");
        setCapacity("40");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.settings.addMember}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t.common.name}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.position}</Label>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder={t.settings.positionPlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.emailOptional}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t.settings.role}</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {(t.role as Record<string, string>)[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t.settings.capacity}</Label>
              <Input
                type="number"
                min={0}
                max={168}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>
          {email.trim() && (
            <p className="text-xs text-muted-foreground">
              {t.settings.tempPassword}: <code>demo1234</code>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={submit} disabled={pending || !name}>
            {t.common.add}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({
  member,
  onOpenChange,
}: {
  member: UserDTO | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState("MEMBER");
  const [position, setPosition] = useState("");
  const [capacity, setCapacity] = useState("40");
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");

  // Sync form when a member is selected for editing.
  useEffect(() => {
    if (member) {
      setRole(member.role);
      setPosition(member.position ?? "");
      setCapacity(String(member.weeklyCapacityHours));
      setLeaveFrom(member.unavailableFrom ?? "");
      setLeaveTo(member.unavailableTo ?? "");
    }
  }, [member]);

  const open = !!member;
  const invalidRange = !!leaveFrom && !!leaveTo && leaveTo < leaveFrom;

  const submit = () => {
    if (!member || invalidRange) return;
    startTransition(async () => {
      const res = await updateUser(member.id, {
        role: role as (typeof ROLES)[number],
        position: position.trim(),
        weeklyCapacityHours: Number(capacity) || 40,
        unavailableFrom: leaveFrom || null,
        unavailableTo: leaveTo || null,
      });
      if (res.ok) {
        toast.success(res.message);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.settings.editMember} — {member?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{t.settings.position}</Label>
          <Input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder={t.settings.positionPlaceholder}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t.settings.role}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {(t.role as Record<string, string>)[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.capacity}</Label>
            <Input
              type="number"
              min={0}
              max={168}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <Label>{t.settings.leave}</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">
                {t.settings.leaveFrom}
              </span>
              <Input
                type="date"
                value={leaveFrom}
                onChange={(e) => setLeaveFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">
                {t.settings.leaveTo}
              </span>
              <Input
                type="date"
                value={leaveTo}
                min={leaveFrom || undefined}
                onChange={(e) => setLeaveTo(e.target.value)}
              />
            </div>
          </div>
          {invalidRange ? (
            <p className="text-xs text-destructive">{t.settings.leaveInvalid}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t.settings.leaveHint}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={submit} disabled={pending || invalidRange}>
            {t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
