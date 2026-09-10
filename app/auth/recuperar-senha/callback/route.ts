import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL("/redefinir-senha", url.origin));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }

  const response = NextResponse.redirect(new URL("/login?erro=recuperacao-invalida", url.origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
