import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TABLE_LABELS } from "@/lib/admin/reference";
import { isWhitelistedTable } from "@/lib/validation";
import type { Database } from "@/types/database";

type Change = Database["public"]["Tables"]["staging_changes"]["Row"];

function targetLabel(table: string): string {
  return isWhitelistedTable(table) ? TABLE_LABELS[table] : table;
}

function ChangeRow({ change }: { change: Change }) {
  return (
    <Link
      href={`/admin/queue/${change.id}`}
      className="hover:border-foreground/30 flex flex-wrap items-center gap-2 rounded-md border p-3"
    >
      <Badge variant={change.target_id ? "outline" : "secondary"}>
        {change.target_id ? "update" : "insert"}
      </Badge>
      <span className="font-medium">{targetLabel(change.target_table)}</span>
      <Badge variant="outline">{change.source}</Badge>
      {change.confidence !== null ? (
        <span className="text-muted-foreground text-xs">
          {Math.round(change.confidence * 100)}% confidence
        </span>
      ) : null}
      <span className="text-muted-foreground ml-auto text-xs">
        {change.created_at.slice(0, 16).replace("T", " ")}
      </span>
    </Link>
  );
}

function List({ changes, empty }: { changes: Change[]; empty: string }) {
  if (changes.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">{empty}</p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {changes.map((c) => (
        <ChangeRow key={c.id} change={c} />
      ))}
    </div>
  );
}

export default async function QueuePage() {
  const supabase = await createClient();
  const [{ data: pending }, { data: approved }, { data: rejected }] =
    await Promise.all([
      supabase
        .from("staging_changes")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("staging_changes")
        .select("*")
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false })
        .limit(25),
      supabase
        .from("staging_changes")
        .select("*")
        .eq("status", "rejected")
        .order("reviewed_at", { ascending: false })
        .limit(25),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Review queue</h2>
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pending?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="pt-4">
          <List
            changes={pending ?? []}
            empty="Nothing to review. Phase 4's research jobs will populate this queue with proposed changes."
          />
        </TabsContent>
        <TabsContent value="approved" className="pt-4">
          <List changes={approved ?? []} empty="No approved changes yet." />
        </TabsContent>
        <TabsContent value="rejected" className="pt-4">
          <List changes={rejected ?? []} empty="No rejected changes yet." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
