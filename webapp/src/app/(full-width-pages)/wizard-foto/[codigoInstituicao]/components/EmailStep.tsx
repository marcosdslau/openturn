"use client";

import { useState } from "react";

interface EmailStepProps {
  codigoInstituicao: number;
  onNext: (wizardToken: string) => void;
}

export default function EmailStep({ codigoInstituicao, onNext }: EmailStepProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { verificarEmail } = await import("@/services/wizard-foto.service");
      const result = await verificarEmail(codigoInstituicao, email.trim());

      if (!result.encontrado || !result.wizardToken) {
        setError(
          "Usuário não localizado. Procure o balcão de atendimento para regularizar seu cadastro.",
        );
        return;
      }

      onNext(result.wizardToken);
    } catch (err) {
      setError((err as Error).message ?? "Erro ao verificar e-mail. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          Informe seu e-mail
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Digite o e-mail cadastrado na instituição para continuar.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-gray-800 dark:text-white placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Verificando..." : "Próximo"}
        </button>
      </form>
    </div>
  );
}
