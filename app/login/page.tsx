import { redirect } from "next/navigation";
import { getCrmSessionUser } from "../../lib/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ erro?: string; mensagem?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await getCrmSessionUser()) redirect("/");
  const { erro, mensagem } = await searchParams;
  const initialError = erro === "recuperacao-invalida"
    ? "O link de recuperação é inválido ou expirou."
    : erro === "link-invalido"
      ? "Link inválido ou expirado."
      : erro === "sem-acesso"
        ? "Sua conta não tem acesso ativo ao CRM. Entre em contato com o administrador."
        : "";
  const initialMessage = mensagem === "senha-atualizada"
    ? "Senha atualizada com sucesso. Entre com a nova senha."
    : "";
  return <LoginForm initialError={initialError} initialMessage={initialMessage} />;
}
