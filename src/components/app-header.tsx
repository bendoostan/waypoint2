import Link from "next/link";

import { signOut } from "@/lib/supabase/actions";
import { Button } from "@/components/ui/button";

// App chrome for authenticated pages. The Admin link is rendered only for
// admins — this is UX; RLS and the /admin gate are the real access controls.
export function AppHeader({
  email,
  isAdmin,
}: {
  email: string | null;
  isAdmin: boolean;
}) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/dashboard" className="font-semibold">
          Waypoint
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </Link>
          {isAdmin ? (
            <Link
              href="/admin"
              className="text-muted-foreground hover:text-foreground"
            >
              Admin
            </Link>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {email ? (
            <span className="text-muted-foreground hidden text-sm sm:inline">
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
