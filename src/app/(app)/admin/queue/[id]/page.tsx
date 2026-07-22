import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { fetchReferenceRow, TABLE_LABELS } from "@/lib/admin/reference";
import { isWhitelistedTable, validateProposed } from "@/lib/validation";

import { DiffView } from "../diff-view";
import { ReviewActions } from "../review-actions";

export default async function ChangeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: change } = await supabase
    .from("staging_changes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!change) notFound();

  const proposed = (change.proposed ?? {}) as Record<string, unknown>;
  const existing = change.target_id
    ? await fetchReferenceRow(supabase, change.target_table, change.target_id)
    : null;

  const label = isWhitelistedTable(change.target_table)
    ? TABLE_LABELS[change.target_table]
    : change.target_table;
  const isPending = change.status === "pending";

  // Surface validation problems up front so the reviewer knows an approve
  // will be rejected by the schema before they click.
  const validation = validateProposed(
    change.target_table,
    change.proposed,
    existing
  );
  const whitelisted = isWhitelistedTable(change.target_table);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/admin/queue"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          ← Review queue
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{label}</h2>
        <Badge variant={change.target_id ? "outline" : "secondary"}>
          {change.target_id ? "update" : "insert"}
        </Badge>
        <Badge variant="outline">{change.source}</Badge>
        <StatusBadge status={change.status} />
      </div>

      <dl className="text-muted-foreground grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase">Target table</dt>
          <dd className="text-foreground font-mono">{change.target_table}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase">Confidence</dt>
          <dd className="text-foreground">
            {change.confidence !== null
              ? `${Math.round(change.confidence * 100)}%`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">Created</dt>
          <dd className="text-foreground">
            {change.created_at.slice(0, 16).replace("T", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase">Reviewed</dt>
          <dd className="text-foreground">
            {change.reviewed_at
              ? change.reviewed_at.slice(0, 16).replace("T", " ")
              : "—"}
          </dd>
        </div>
      </dl>

      {change.source_urls && change.source_urls.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs uppercase">
            Sources
          </span>
          <ul className="flex flex-col gap-0.5 text-sm">
            {change.source_urls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DiffView proposed={proposed} existing={existing} />

      {!whitelisted ? (
        <p className="text-destructive text-sm">
          Target table “{change.target_table}” is not whitelisted and cannot be
          applied.
        </p>
      ) : !validation.ok ? (
        <p className="text-destructive text-sm">
          This proposal will fail validation: {validation.error}
        </p>
      ) : null}

      {isPending ? (
        <ReviewActions id={change.id} />
      ) : (
        <p className="text-muted-foreground text-sm">
          This change is {change.status} and can no longer be actioned.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "approved"
      ? "default"
      : status === "rejected"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}
