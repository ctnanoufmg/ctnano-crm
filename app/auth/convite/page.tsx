"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

export default function InvitePage() {
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    async function acceptInvite() {
      const supabase = createSupabaseBrowserClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const result = code ? await supabase.auth.exchangeCodeForSession(code)
        : tokenHash ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" })
          : await supabase.auth.getSession();
      if (disposed) return;
      // The client consumes implicit invitation tokens from the URL fragment.
      if (result.error || !result.data.session) {
        setError("Convite inválido ou expirado. Entre em contato com o administrador.");
        return;
      }
      window.history.replaceState(null, "", "/auth/convite");
      window.location.replace("/redefinir-senha");
    }
    void acceptInvite().catch(() => { if (!disposed) setError("Não foi possível aceitar o convite. Tente novamente."); });
    return () => { disposed = true; };
  }, []);
  return <main className="login-page"><section className="login-card"><h1>Convite para o CTNano CRM</h1>{error ? <><p className="login-error" role="alert">{error}</p><a href="/login">Voltar para o acesso</a></> : <p role="status">Validando seu convite...</p>}</section></main>;
}
