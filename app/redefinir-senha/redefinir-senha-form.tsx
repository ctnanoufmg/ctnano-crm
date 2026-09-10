"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

export default function RedefinirSenhaForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("Não foi possível atualizar a senha. Solicite um novo link de recuperação.");
      setLoading(false);
      return;
    }

    await supabase.auth.signOut({ scope: "global" });
    window.location.assign("/login?mensagem=senha-atualizada");
  }

  return <form onSubmit={submit}>
    <label><span>Nova senha *</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
    <label><span>Confirmar nova senha *</span><input name="confirmation" type="password" autoComplete="new-password" minLength={8} required /></label>
    {error && <p className="login-error" role="alert">{error}</p>}
    <button className="primary-button full" disabled={loading}>{loading ? "Atualizando..." : "Salvar nova senha"}</button>
  </form>;
}
