import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recuperar senha | SchoolGuard",
  description: "Solicite um link por e-mail para redefinir sua senha SchoolGuard.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
