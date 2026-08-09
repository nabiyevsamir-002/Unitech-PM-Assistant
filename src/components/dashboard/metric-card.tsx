import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "danger" | "success";
  href?: string;
}) {
  const toneStyles = {
    default: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/15",
    danger: "text-destructive bg-destructive/12",
    success: "text-success bg-success/12",
  }[tone];

  const content = (
    <Card className="flex flex-row items-center gap-4 p-4 transition-shadow hover:shadow-sm sm:p-5">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          toneStyles,
        )}
      >
        <Icon className="size-5.5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl leading-none font-semibold tabular-nums">
          {value}
        </div>
        <div className="mt-1 truncate text-sm text-muted-foreground">
          {label}
        </div>
      </div>
    </Card>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  return content;
}
