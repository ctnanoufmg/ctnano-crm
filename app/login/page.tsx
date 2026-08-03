import { redirect } from "next/navigation";
import { getCrmSessionUser } from "../../lib/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCrmSessionUser()) redirect("/");
  return <LoginForm />;
}
