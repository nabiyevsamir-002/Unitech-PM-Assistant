"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Anchor as AnchorIcon,
  Users,
  Check,
  ArrowRight,
  ArrowLeft,
  UserPlus,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ROLES } from "@/lib/constants";
import { DEFAULT_ANCHORS } from "@/lib/excel/anchors";
import { connectExcelSource, confirmAnchorMapping } from "@/app/actions/onboarding";
import { createUser } from "@/app/actions/users";
import type { OnboardingProject, UserDTO } from "@/lib/types";

const ANCHOR_ROWS = Object.values(DEFAULT_ANCHORS);

export function OnboardingWizard({
  projects,
  members,
  defaultFilePath,
}: {
  projects: OnboardingProject[];
  members: UserDTO[];
  defaultFilePath: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState(
    projects.find((p) => !p.excelConfirmed)?.id ?? projects[0]?.id ?? "",
  );

  const selected = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );

  const steps = [
    { n: 1, label: t.onboarding.stepExcel, icon: FileSpreadsheet, done: !!selected?.excelConnected },
    { n: 2, label: t.onboarding.stepAnchors, icon: AnchorIcon, done: !!selected?.excelConfirmed },
    { n: 3, label: t.onboarding.stepTeam, icon: Users, done: members.length > 1 },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.onboarding.title}</h1>
        <p className="text-sm text-muted-foreground">{t.onboarding.subtitle}</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const active = step === s.n;
          return (
            <div key={s.n} className="flex flex-1 items-center last:flex-none">
              <button
                onClick={() => setStep(s.n)}
                className="flex items-center gap-2"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : s.done
                        ? "border-success bg-success/15 text-success"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {s.done && !active ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span
                  className={cn(
                    "hidden text-sm font-medium sm:inline",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 flex-1 rounded",
                    s.done ? "bg-success/40" : "bg-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {projects.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {t.onboarding.noProjects}
        </Card>
      ) : step === 1 ? (
        <StepExcel
          projects={projects}
          projectId={projectId}
          setProjectId={setProjectId}
          selected={selected}
          defaultFilePath={defaultFilePath}
          onNext={() => setStep(2)}
        />
      ) : step === 2 ? (
        <StepAnchors
          selected={selected}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      ) : (
        <StepTeam members={members} onBack={() => setStep(2)} onFinish={() => router.push("/dashboard")} />
      )}
    </div>
  );
}

function StepExcel({
  projects,
  projectId,
  setProjectId,
  selected,
  defaultFilePath,
  onNext,
}: {
  projects: OnboardingProject[];
  projectId: string;
  setProjectId: (v: string) => void;
  selected: OnboardingProject | undefined;
  defaultFilePath: string;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filePath, setFilePath] = useState(defaultFilePath);

  const connect = () =>
    startTransition(async () => {
      const res = await connectExcelSource({ projectId, fileLocation: filePath.trim() });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">{t.onboarding.excelIntro}</p>

        <div className="space-y-1.5">
          <Label>{t.onboarding.selectProject}</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.excelConnected ? " ✓" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t.onboarding.filePath}</Label>
          <Input
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            className="font-mono text-sm"
          />
        </div>

        {selected?.excelConnected && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" />
            {t.onboarding.connected}
          </p>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={connect} disabled={pending || !filePath.trim()}>
            <FileSpreadsheet className="size-4" />
            {selected?.excelConnected ? t.onboarding.reconnect : t.onboarding.connect}
          </Button>
          <Button onClick={onNext} disabled={!selected?.excelConnected}>
            {t.onboarding.next}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepAnchors({
  selected,
  onBack,
  onNext,
}: {
  selected: OnboardingProject | undefined;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!selected) return;
    startTransition(async () => {
      const res = await confirmAnchorMapping(selected.id);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">{t.onboarding.anchorsIntro}</p>

        {!selected?.excelConnected ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t.onboarding.connectFirst}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            {ANCHOR_ROWS.map((a, i) => (
              <div
                key={`${a.sheet}-${a.cell}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm",
                  i > 0 && "border-t",
                )}
              >
                <AnchorIcon className="size-3.5 shrink-0 text-primary" />
                <span className="flex-1 truncate">{a.label}</span>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {a.sheet}!{a.cell}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {selected?.excelConfirmed && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" />
            {t.onboarding.confirmed}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {t.common.back}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={confirm}
              disabled={pending || !selected?.excelConnected || selected?.excelConfirmed}
            >
              <Check className="size-4" />
              {t.onboarding.confirmMapping}
            </Button>
            <Button onClick={onNext} disabled={!selected?.excelConfirmed}>
              {t.onboarding.next}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StepTeam({
  members,
  onBack,
  onFinish,
}: {
  members: UserDTO[];
  onBack: () => void;
  onFinish: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");

  const add = () =>
    startTransition(async () => {
      const res = await createUser({
        name: name.trim(),
        email: email.trim(),
        role: role as (typeof ROLES)[number],
      });
      if (res.ok) {
        toast.success(`${res.message} · ${t.settings.tempPassword}: demo1234`);
        setName("");
        setEmail("");
        setRole("MEMBER");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">{t.onboarding.teamIntro}</p>

        <div className="space-y-1 rounded-lg border p-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
              <UserAvatar name={m.name} image={m.avatar} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <RoleBadge role={m.role} />
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t.common.name}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.auth.email}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
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
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={add}
              disabled={pending || !name.trim() || !email.trim()}
            >
              <UserPlus className="size-4" />
              {t.settings.addMember}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-4" />
            {t.common.back}
          </Button>
          <Button onClick={onFinish}>
            <Check className="size-4" />
            {t.onboarding.finish}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
