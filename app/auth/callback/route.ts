import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL("/", url.origin));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }
  // Admin invitation links use implicit tokens in the URL fragment. Browsers
  // preserve the fragment across this redirect so the client can consume it.
  const response = NextResponse.redirect(new URL(code ? "/login?erro=link-invalido" : "/auth/convite", url.origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
