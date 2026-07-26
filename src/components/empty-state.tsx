import Link from "next/link";

import { Button } from "@/components/ui/button";

// An honest empty state (DESIGN.md): a real invitation, never a broken CTA.
export function EmptyState({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border-wp-border-2 bg-wp-panel shadow-wp-sm flex flex-col items-center rounded-2xl border px-8 py-16 text-center">
      {icon ? <div className="text-wp-accent-text mb-4">{icon}</div> : null}
      {eyebrow ? <div className="wp-eyebrow mb-3">{eyebrow}</div> : null}
      <h2 className="font-display text-wp-ink max-w-md text-2xl font-semibold">
        {title}
      </h2>
      <p className="text-wp-muted mt-3 max-w-md text-[15px] leading-relaxed">
        {description}
      </p>
      {actionHref && actionLabel ? (
        <Button asChild className="mt-6">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
