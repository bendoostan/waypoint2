import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/supabase/auth";
import { AppHeader } from "@/components/app-header";

// Layout group for authenticated pages. Middleware already redirects
// unauthenticated requests; this is the server-side belt to its suspenders.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <AppHeader email={session.user.email} isAdmin={session.isAdmin} />
      {children}
    </div>
  );
}
