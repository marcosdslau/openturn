"use client";

import Link from "next/link";
import Label from "../form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { apiPost } from "@/lib/api";

const inputClass =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:focus:border-brand-800";

export default function ConfirmResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (novaSenha.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await apiPost<{ message: string }>("/auth/reset-password", {
        token,
        novaSenha,
      });
      router.push("/signin?reset=ok");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Não foi possível redefinir a senha. Tente novamente.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex flex-col flex-1 lg:w-1/2 w-full">
        <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
          <div className="p-4 text-sm text-amber-800 bg-amber-50 rounded-lg border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
            Link inválido ou incompleto. Solicite um novo e-mail de redefinição de senha.
          </div>
          <div className="mt-6 space-y-3">
            <Link
              href="/reset-password"
              className="block text-center text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Solicitar novo link
            </Link>
            <Link
              href="/signin"
              className="block text-center text-sm text-gray-600 dark:text-gray-400"
            >
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="w-full max-w-md pt-10 mx-auto">
        <Link
          href="/signin"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <svg
            className="stroke-current"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
          >
            <path
              d="M12.7083 5L7.5 10.2083L12.7083 15.4167"
              stroke=""
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Voltar ao login
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
            Nova senha
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Escolha uma nova senha para sua conta SchoolGuard.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
            <div>
              <Label>
                Nova senha <span className="text-error-500">*</span>
              </Label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  className={inputClass}
                  required
                  minLength={6}
                />
                <span
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                >
                  {showPassword ? (
                    <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                  ) : (
                    <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                  )}
                </span>
              </div>
            </div>
            <div>
              <Label>
                Confirmar senha <span className="text-error-500">*</span>
              </Label>
              <div className="relative">
                <input
                  type={showPassword2 ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Repita a nova senha"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  className={inputClass}
                  required
                  minLength={6}
                />
                <span
                  onClick={() => setShowPassword2(!showPassword2)}
                  className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                >
                  {showPassword2 ? (
                    <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                  ) : (
                    <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                  )}
                </span>
              </div>
            </div>
            <div>
              <Button className="w-full" size="sm" disabled={loading} type="submit">
                {loading ? "Salvando..." : "Redefinir senha"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
