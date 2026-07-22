import { notFound } from "next/navigation";

import { getSessionContext } from "@/lib/supabase/auth";
import { AdminNav } from "@/components/admin/admin-nav";

// Hard admin gate. RLS already denies reference/pipeline writes and pipeline
// reads to non-admins; this returns 404 so /admin/* is invisible to them.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  if (!session?.isAdmin) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Admin</h1>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
