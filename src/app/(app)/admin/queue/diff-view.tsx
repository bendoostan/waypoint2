import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function render(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function changed(a: unknown, b: unknown): boolean {
  return render(a) !== render(b);
}

/**
 * Field-level diff. For updates (existing present) each proposed key is shown
 * against the current value with changed rows highlighted. For inserts the
 * full proposed record is shown as the new row.
 */
export function DiffView({
  proposed,
  existing,
}: {
  proposed: Record<string, unknown>;
  existing: Record<string, unknown> | null;
}) {
  const isInsert = existing === null;
  const keys = isInsert
    ? Object.keys(proposed)
    : Object.keys(proposed).filter((k) => k !== "id");

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Field</TableHead>
            {!isInsert ? <TableHead>Current</TableHead> : null}
            <TableHead>{isInsert ? "Value" : "Proposed"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => {
            const isDiff = isInsert || changed(existing?.[key], proposed[key]);
            return (
              <TableRow key={key}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {key}
                    {!isInsert && isDiff ? (
                      <Badge variant="secondary">changed</Badge>
                    ) : null}
                  </span>
                </TableCell>
                {!isInsert ? (
                  <TableCell className="text-muted-foreground">
                    {render(existing?.[key])}
                  </TableCell>
                ) : null}
                <TableCell className={isDiff ? "font-medium" : ""}>
                  {render(proposed[key])}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
