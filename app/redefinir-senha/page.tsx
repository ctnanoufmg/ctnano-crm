import Image from "next/image";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import RedefinirSenhaForm from "./redefinir-senha-form";

export const dynamic = "force-dynamic";

export default async function RedefinirSenhaPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user?.email?.toLowerCase().endsWith("@ctnano.org")) {
    redirect("/login?erro=recuperacao-invalida");
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="login-brand">
        <Image src="/ctnano-logo.webp" alt="CTNano/UFMG" width={270} height={82} priority />
        <span>CRM · Novos Negócios</span>
      </div>
      <div><p className="eyebrow">Acesso institucional</p><h1>Redefinir senha</h1><p className="login-copy">Crie uma nova senha para sua conta institucional.</p></div>
      <RedefinirSenhaForm />
      <small className="login-note">O link de recuperação é pessoal e deve ser utilizado somente por você.</small>
    </section>
  </main>;
}
