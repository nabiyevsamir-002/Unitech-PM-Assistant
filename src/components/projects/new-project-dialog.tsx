"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LayoutTemplate, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { CURRENCIES } from "@/lib/constants";
import { PROJECT_TEMPLATES } from "@/lib/templates";
import {
  createProject,
  createProjectFromTemplate,
} from "@/app/actions/projects";
import type { ClientDTO } from "@/lib/types";

const BLANK = "__blank__";

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewProjectDialog({
  open,
  onOpenChange,
  clients,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: ClientDTO[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Selected source: a template id, or BLANK for an empty project.
  const [source, setSource] = useState<string>(BLANK);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("none");
  const [startDate, setStartDate] = useState(todayInput());
  const [currency, setCurrency] = useState("AZN");

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSource(BLANK);
      setName("");
      setClientId("none");
      setStartDate(todayInput());
      setCurrency("AZN");
    }
  }, [open]);

  const submit = () => {
    if (!name.trim()) {
      toast.error(t.projects.projectName);
      return;
    }
    startTransition(async () => {
      const client = clientId === "none" ? null : clientId;
      const iso = startDate ? new Date(startDate).toISOString() : null;
      const res =
        source === BLANK
          ? await createProject({
              name: name.trim(),
              clientId: client,
              startDate: iso,
              currency: currency as (typeof CURRENCIES)[number],
            })
          : await createProjectFromTemplate(source, {
              name: name.trim(),
              clientId: client,
              startDate: iso,
            });

      if (res.ok && res.projectId) {
        toast.success(res.message);
        onOpenChange(false);
        router.push(`/projects/${res.projectId}`);
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.projects.newProject}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source picker: blank + template cards */}
          <div className="space-y-1.5">
            <Label>{t.projects.chooseTemplate}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <SourceCard
                selected={source === BLANK}
                onSelect={() => setSource(BLANK)}
                accent="var(--primary)"
                icon={<FilePlus2 className="size-4" />}
                title={t.projects.blankProject}
                description={t.projects.newProject}
              />
              {PROJECT_TEMPLATES.map((tpl) => (
                <SourceCard
                  key={tpl.id}
                  selected={source === tpl.id}
                  onSelect={() => setSource(tpl.id)}
                  accent={tpl.color}
                  icon={<LayoutTemplate className="size-4" />}
                  title={tpl.name}
                  description={`${tpl.tasks.length} ${t.projects.templateTasksNote}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.projects.projectName}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder={t.projects.projectName}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.common.client}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder={t.projects.selectClient} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.projects.noClient}</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t.common.startDate}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* Currency only applies to a blank project; templates carry their own. */}
            {source === BLANK && (
              <div className="space-y-1.5">
                <Label>{t.projects.currency}</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {t.common.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceCard({
  selected,
  onSelect,
  accent,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  accent: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "hover:border-primary/40 hover:bg-accent",
      )}
    >
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-white"
        style={{ backgroundColor: accent }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      {selected && (
        <Check className="absolute top-2 right-2 size-4 text-primary" />
      )}
    </button>
  );
}
