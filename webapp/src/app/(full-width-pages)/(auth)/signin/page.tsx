import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar | SchoolGuard",
  description: "Acesse o painel SchoolGuard com seu e-mail e senha.",
};

export default function SignIn() {
  return <SignInForm />;
}
