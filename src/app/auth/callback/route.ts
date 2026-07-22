import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Magic-link landing (PKCE). Supabase's default email link routes through its
// verify endpoint and back here with `?code=…`; we exchange it for a session
// cookie and redirect into the app. This is the flow used when the login page
// sets emailRedirectTo to /auth/callback.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Behind Vercel/proxies request.url is the internal origin, so prefer
      // the forwarded host to land on the real public domain.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const base =
        process.env.NODE_ENV === "development" || !forwardedHost
          ? origin
          : `https://${forwardedHost}`;
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", request.url));
}
