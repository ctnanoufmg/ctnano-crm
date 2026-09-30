"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type LoginMode = "login" | "signup" | "recovery";

type LoginFormProps = {
  initialError?: string;
  initialMessage?: string;
};

const recoveryMessage = "Se existir uma conta vinculada a esse e-mail, você receberá um link para redefinir sua senha.";

export default function LoginForm({ initialError = "", initialMessage = "" }: LoginFormProps) {
  const [mode, setMode] = useState<LoginMode>("login");
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);

  function changeMode(nextMode: LoginMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();

    if (mode === "signup" && !email.endsWith("@ctnano.org")) {
      setError("Use seu e-mail institucional @ctnano.org.");
      setLoading(false);
      return;
    }
    if (mode !== "recovery" && password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      setLoading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();

    if (mode === "recovery") {
      try {
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/recuperar-senha/callback`,
        });
        setMessage(recoveryMessage);
      } catch {
        setError("Não foi possível solicitar a recuperação agora. Verifique sua conexão e tente novamente.");
      }
    } else if (mode === "signup") {
      if (!fullName) {
        setError("Informe seu nome completo.");
        setLoading(false);
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
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
      <div className="login-brand">
        <Image src="/ctnano-logo.webp" alt="CTNano/UFMG" width={270} height={82} priority />
        <span>CRM · Novos Negócios</span>
      </div>
      <div>
        <p className="eyebrow">Acesso institucional</p>
        {mode === "signup" && <h1>Criar uma conta</h1>}
        {mode === "recovery" && <h1>Recuperar senha</h1>}
        <p className="login-copy">{mode === "recovery" ? "Informe o e-mail da sua conta para receber o link de redefinição." : "Equipe CTNano e auditores cadastrados pelo administrador."}</p>
      </div>
      <form onSubmit={submit}>
        {mode === "signup" && <>
          <label><span>Nome completo *</span><input name="fullName" autoComplete="name" required /></label>
          <label><span>Telefone</span><input name="phone" type="tel" autoComplete="tel" /></label>
        </>}
        <label><span>{mode === "signup" ? "E-mail institucional" : "E-mail"} *</span><input name="email" type="email" autoComplete="email" placeholder={mode === "signup" ? "nome@ctnano.org" : "E-mail cadastrado"} required /></label>
        {mode !== "recovery" && <label><span>Senha *</span><input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>}
        {error && <p className="login-error" role="alert">{error}</p>}
        {message && <p className="login-success" role="status">{message}</p>}
        <button className="primary-button full" disabled={loading}>{loading ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "signup" ? "Cadastrar" : "Enviar link de recuperação"}</button>
      </form>
      <div className="login-links">
        {mode === "login" && <>
          <button type="button" className="login-switch" onClick={() => changeMode("recovery")}>Esqueci minha senha</button>
          <button type="button" className="login-switch" onClick={() => changeMode("signup")}>Primeiro acesso? Cadastre-se</button>
        </>}
        {mode !== "login" && <button type="button" className="login-switch" onClick={() => changeMode("login")}>Voltar para o acesso</button>}
      </div>
      <small className="login-note">Auditores externos precisam ser cadastrados por um administrador e possuem acesso somente para visualização. O cadastro público é exclusivo para @ctnano.org.</small>
    </section>
  </main>;
}
