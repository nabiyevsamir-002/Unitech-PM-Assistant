"use client";

import { signOut } from "next-auth/react";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useI18n } from "@/components/providers/i18n-provider";

export function UserMenu({
  name,
  email,
  role,
  image,
}: {
  name: string;
  email: string;
  role: string;
  image?: string | null;
}) {
  const { t } = useI18n();
  const roleLabel = (t.role as Record<string, string>)[role] ?? role;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none ring-ring focus-visible:ring-2">
        <UserAvatar name={name} image={image} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {email}
            </span>
            <span className="mt-1 text-xs font-normal text-primary">
              {roleLabel}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <SettingsIcon className="mr-2 size-4" />
            {t.nav.settings}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="mr-2 size-4" />
          {t.nav.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
