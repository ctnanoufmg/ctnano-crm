"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";
import { acceptCrmInvitation } from "../../../lib/invitation";

export default function InvitePage() {
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    async function acceptInvite() {
      const url = new URL(window.location.href);
      // Remove credentials before the PKCE client initializes or logs URL errors.
      window.history.replaceState(null, "", "/auth/convite");
      const supabase = createSupabaseBrowserClient();
      const result = await acceptCrmInvitation(supabase, url);
      if (disposed) return;
      if (result.error || !result.data.session) {
        setError("Convite inválido ou expirado. Entre em contato com o administrador.");
        return;
      }
      window.location.replace("/redefinir-senha");
    }
    void acceptInvite().catch(() => { if (!disposed) setError("Não foi possível aceitar o convite. Tente novamente."); });
    return () => { disposed = true; };
  }, []);
  return <main className="login-page"><section className="login-card"><h1>Convite para o CTNano CRM</h1>{error ? <><p className="login-error" role="alert">{error}</p><a href="/login">Voltar para o acesso</a></> : <p role="status">Validando seu convite...</p>}</section></main>;
}
