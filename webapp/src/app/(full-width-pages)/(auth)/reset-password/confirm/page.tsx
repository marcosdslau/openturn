import ConfirmResetPasswordForm from "@/components/auth/ConfirmResetPasswordForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Nova senha | SchoolGuard",
  description: "Defina uma nova senha para sua conta SchoolGuard.",
};

function ConfirmFallback() {
  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full items-center justify-center min-h-[200px]">
      <p className="text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
    </div>
  );
}

export default function ConfirmResetPasswordPage() {
  return (
    <Suspense fallback={<ConfirmFallback />}>
      <ConfirmResetPasswordForm />
    </Suspense>
  );
}
