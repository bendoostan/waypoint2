import { getSessionContext } from "@/lib/supabase/auth";

export default async function DashboardPage() {
  const session = await getSessionContext();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Waypoint</h1>
      <p className="text-muted-foreground">
        Signed in as <span className="font-medium">{session?.user.email}</span>.
        The consumer app arrives in Phase 3.{" "}
        {session?.isAdmin ? "Admins can" : "Admins"} manage the knowledge graph
        from the Admin portal.
      </p>
    </main>
  );
}
