"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

export default function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    if (!email.endsWith("@ctnano.org")) {
      setError("Use seu e-mail institucional @ctnano.org."); setLoading(false); return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres."); setLoading(false); return;
    }
    const supabase = createSupabaseBrowserClient();
    if (mode === "signup") {
      if (!fullName) { setError("Informe seu nome completo."); setLoading(false); return; }
      const { error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName, phone }, emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signUpError) setError(signUpError.message);
      else setMessage("Cadastro realizado. Verifique seu e-mail institucional para confirmar o acesso.");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError("E-mail ou senha inválidos.");
      else window.location.assign("/");
    }
    setLoading(false);
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="login-brand"><img src="/ctnano-logo.webp" alt="CTNano/UFMG" /><span>CRM · Novos Negócios</span></div>
      <div><p className="eyebrow">Acesso institucional</p>{mode === "signup" && <h1>Criar uma conta</h1>}<p className="login-copy">Acesso exclusivo com e-mail institucional CTNano/UFMG</p></div>
      <form onSubmit={submit}>
        {mode === "signup" && <><label><span>Nome completo *</span><input name="fullName" autoComplete="name" required /></label><label><span>Telefone</span><input name="phone" type="tel" autoComplete="tel" /></label></>}
        <label><span>E-mail institucional *</span><input name="email" type="email" autoComplete="email" placeholder="nome@ctnano.org" required /></label>
        <label><span>Senha *</span><input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        {message && <p className="login-success" role="status">{message}</p>}
        <button className="primary-button full" disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Cadastrar"}</button>
      </form>
      <button className="login-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "Primeiro acesso? Cadastre-se" : "Já possui conta? Entrar"}</button>
      <small className="login-note">O perfil administrativo é atribuído somente por Ricardo Neres ou por outro administrador autorizado.</small>
    </section>
  </main>;
}
