"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // The email's magic link routes here; /auth/callback exchanges the
        // code for a session, then redirects into the app.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Waypoint</CardTitle>
          <CardDescription>
            {sent
              ? `Check ${email} for a sign-in link and open it in this browser.`
              : "We'll email you a link that signs you in — no password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="grid gap-4">
              <p className="text-muted-foreground text-sm">
                The link opens the app already signed in. Didn&apos;t get it?
                Check spam, or send another.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSent(false);
                  setError(null);
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={sendLink} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send sign-in link"}
              </Button>
            </form>
          )}
          {error ? (
            <p className="text-destructive mt-4 text-sm">{error}</p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
