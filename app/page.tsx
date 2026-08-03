import CRMApp from "./crm-app";
import { requireCrmPageUser } from "../lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireCrmPageUser();
  return <CRMApp currentUser={{ email: user.email, name: user.fullName, isAdmin: user.role === "admin" }} />;
}
