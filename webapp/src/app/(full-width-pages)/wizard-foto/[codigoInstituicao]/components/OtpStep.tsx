"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface OtpStepProps {
  codigoInstituicao: number;
  wizardToken: string;
  onNext: (novoWizardToken: string) => void;
}

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 180;

export default function OtpStep({ codigoInstituicao, wizardToken, onNext }: OtpStepProps) {
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [otpEnviado, setOtpEnviado] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  // Guard contra duplo disparo no React Strict Mode (que monta/desmonta 2x em dev)
  const sentRef = useRef(false);

  const handleSendOtp = useCallback(async (isResend = false) => {
    if (!isResend && sentRef.current) return;
    sentRef.current = true;
    setSending(true);
    setError(null);
    try {
      const { enviarOtp } = await import("@/services/wizard-foto.service");
      const result = await enviarOtp(codigoInstituicao, wizardToken);
      if (result.enviado) {
        setOtpEnviado(true);
        setCooldown(result.proximoReenvioEm ?? RESEND_COOLDOWN_SEC);
      }
    } catch (err) {
      sentRef.current = false; // permite retentar em caso de falha
      setError((err as Error).message ?? "Erro ao enviar código. Tente novamente.");
    } finally {
      setSending(false);
    }
  }, [codigoInstituicao, wizardToken]);

  // Envia o OTP automaticamente ao montar o componente (apenas 1x)
  useEffect(() => {
    handleSendOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contador de cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);


  function handleChange(value: string, index: number) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === "Backspace") {
      const next = [...otp];
      if (!otp[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
      next[index] = "";
      setOtp(next);
    }
    if (e.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const chars = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
    const next = [...otp];
    chars.forEach((c, i) => { if (i < OTP_LENGTH) next[i] = c; });
    setOtp(next);
    const lastIdx = Math.min(chars.length - 1, OTP_LENGTH - 1);
    inputsRef.current[lastIdx]?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const codigo = otp.join("");
    if (codigo.length !== OTP_LENGTH) return;

    setError(null);
    setLoading(true);
    try {
      const { verificarOtp } = await import("@/services/wizard-foto.service");
      const result = await verificarOtp(codigoInstituicao, wizardToken, codigo);
      if (!result.valido || !result.wizardToken) {
        setError("Código inválido, expirado ou com muitas tentativas. Solicite um novo código.");
        return;
      }
      onNext(result.wizardToken);
    } catch (err) {
      setError((err as Error).message ?? "Erro ao verificar código.");
    } finally {
      setLoading(false);
    }
  }

  const codigoCompleto = otp.every((d) => d !== "");

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          Código de verificação
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {otpEnviado
            ? "Enviamos um código de 6 dígitos para o seu e-mail. Digite-o abaixo."
            : "Enviando código para o seu e-mail..."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex justify-center gap-2">
          {Array.from({ length: OTP_LENGTH }).map((_, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={otp[i]}
              onChange={(e) => handleChange(e.target.value, i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onPaste={handlePaste}
              className="w-12 h-14 text-center text-2xl font-bold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !codigoCompleto}
          className="w-full rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Verificando..." : "Próximo"}
        </button>
      </form>

      <div className="text-center">
        {cooldown > 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Reenviar código em{" "}
            <span className="font-semibold tabular-nums">{cooldown}s</span>
          </p>
        ) : (
          <button
            onClick={() => handleSendOtp(true)}
            disabled={sending}
            className="text-sm text-brand-500 hover:text-brand-600 font-medium disabled:opacity-50"
          >
            {sending ? "Reenviando..." : "Reenviar código"}
          </button>
        )}
      </div>
    </div>
  );
}
