import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CurrencyForm, NewCurrencyButton } from "./currency-form";

export default async function CurrenciesPage() {
  const supabase = await createClient();
  const { data: currencies } = await supabase
    .from("currencies")
    .select("*")
    .order("kind")
    .order("name");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Currencies</h2>
        <NewCurrencyButton />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Alliance</TableHead>
              <TableHead className="text-right">Cashback cpp</TableHead>
              <TableHead className="text-right">Transfer cpp</TableHead>
              <TableHead>Unlock</TableHead>
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(currencies ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{c.kind}</Badge>
                </TableCell>
                <TableCell>
                  {c.alliance ? (
                    <Badge variant="outline">{c.alliance}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.cashback_cpp}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.transfer_cpp}
                </TableCell>
                <TableCell>
                  {c.requires_unlock ? (
                    <Badge variant="outline">requires</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {c.is_active ? (
                    <Badge variant="secondary">active</Badge>
                  ) : (
                    <Badge variant="destructive">inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <CurrencyForm
                    currency={c}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
