import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_VARIANT = {
  running: "secondary",
  succeeded: "default",
  failed: "destructive",
} as const;

export default async function RunsPage() {
  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("ingest_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Ingest runs</h2>
      {(runs ?? []).length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No ingest runs yet. Phase 4&apos;s research jobs will record their
          runs here.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Finished</TableHead>
                <TableHead>Stats</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(runs ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.job_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        STATUS_VARIANT[
                          r.status as keyof typeof STATUS_VARIANT
                        ] ?? "outline"
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.started_at.slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.finished_at
                      ? r.finished_at.slice(0, 16).replace("T", " ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[20rem] truncate font-mono text-xs">
                    {r.stats ? JSON.stringify(r.stats) : "—"}
                    {r.error ? ` · error: ${r.error}` : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
