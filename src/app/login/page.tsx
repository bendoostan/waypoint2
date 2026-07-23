"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setBusy(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }

    // signup
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      if (/rate limit/i.test(error.message)) {
        // Supabase still tries to send a confirmation email on signUp
        // whenever "Confirm email" is on, even though this is a password
        // flow — and its built-in sender is heavily throttled. Turning that
        // setting off removes the email step entirely, not just delivery.
        setError(
          "Supabase's email sender is rate-limited, and this project still requires confirming new signups by email. Turn off Confirm email in the Supabase dashboard (Authentication → Providers → Email) — signup will work immediately after, no waiting. Or add the user directly in Authentication → Users → Add user with Auto Confirm checked, then sign in here."
        );
      } else {
        setError(error.message);
      }
      return;
    }
    if (data.session) {
      // Email confirmation is disabled → we're signed in immediately.
      router.push("/dashboard");
      router.refresh();
    } else {
      // Confirmation is on; the confirmation email may be rate-limited. Tell
      // the user how to finish without it.
      setNotice(
        "Account created. If it doesn't sign you in, disable email confirmation in Supabase (Authentication → Providers → Email) or confirm the user in the dashboard, then sign in."
      );
      setMode("signin");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {mode === "signin" ? "Sign in to Waypoint" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {mode === "signin"
              ? "Enter your email and password."
              : "Pick an email and password — no confirmation email required."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
          >
            {mode === "signin"
              ? "Need an account? Create one"
              : "Already have an account? Sign in"}
          </Button>

          {notice ? (
            <p className="text-muted-foreground mt-4 text-sm">{notice}</p>
          ) : null}
          {error ? (
            <p className="text-destructive mt-4 text-sm">{error}</p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
