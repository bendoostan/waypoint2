"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/lib/supabase/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// App chrome for authenticated pages. Translucent paper with a backdrop blur
// (the header treatment from the comps), the Waypoint wordmark in Fraunces, and
// nav as pills — the active one filled. The Admin link renders only for admins;
// RLS and the /admin gate are the real access controls, this is just UX.
type NavItem = { href: string; label: string; match: (p: string) => boolean };

export function AppHeader({
  email,
  isAdmin,
}: {
  email: string | null;
  isAdmin: boolean;
}) {
  const pathname = usePathname() ?? "";

  const items: NavItem[] = [
    {
      href: "/wallet",
      label: "Wallet",
      match: (p) => p.startsWith("/wallet"),
    },
    {
      href: "/dashboard",
      label: "Goals",
      match: (p) =>
        p === "/dashboard" || p.startsWith("/goals") || p.startsWith("/plans"),
    },
  ];
  if (isAdmin) {
    items.push({
      href: "/admin",
      label: "Admin",
      match: (p) => p.startsWith("/admin"),
    });
  }

  return (
    <header className="border-wp-border bg-wp-paper/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="font-display text-wp-ink text-xl font-semibold"
        >
          Waypoint
        </Link>
        <nav className="flex items-center gap-1">
          {items.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-wp-surface-2 text-wp-ink font-semibold"
                    : "text-wp-body hover:bg-wp-track font-medium"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {email ? (
            <span className="text-wp-muted hidden text-sm sm:inline">
              {email}
            </span>
          ) : null}
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
