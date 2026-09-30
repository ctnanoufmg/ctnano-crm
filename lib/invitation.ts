import type { SupabaseClient } from "@supabase/supabase-js";

export async function acceptCrmInvitation(supabase: SupabaseClient, url: URL) {
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const fragment = new URLSearchParams(url.hash.slice(1));
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (fragment.has("error") || fragment.has("error_description")) throw new Error("Invalid invitation");
  if (code) return supabase.auth.exchangeCodeForSession(code);
  if (tokenHash) return supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
  // Admin invitations are implicit grants; the SSR client otherwise expects PKCE.
  if (accessToken && refreshToken) return supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return supabase.auth.getSession();
}
