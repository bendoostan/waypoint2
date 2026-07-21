import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Layout group for authenticated pages. Middleware already redirects
// unauthenticated requests; this is the server-side belt to its suspenders.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <>{children}</>;
}
