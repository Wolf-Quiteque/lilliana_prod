import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/admin");
  return <LoginForm />;
}
