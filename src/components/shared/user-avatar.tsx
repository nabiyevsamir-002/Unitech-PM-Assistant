import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// Deterministic hue from a name, so each person gets a stable color.
function hueFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function UserAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  const hue = hueFromName(name);
  return (
    <Avatar className={cn("size-8", className)}>
      {image ? <AvatarImage src={image} alt={name} /> : null}
      <AvatarFallback
        className="text-xs font-medium text-white"
        style={{ backgroundColor: `oklch(0.6 0.13 ${hue})` }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
