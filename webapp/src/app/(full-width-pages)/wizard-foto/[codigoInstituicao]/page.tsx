"use client";

import { use, useState } from "react";
import EmailStep from "./components/EmailStep";
import OtpStep from "./components/OtpStep";
import InstrucoesStep from "./components/InstrucoesStep";
import FotoStep from "./components/FotoStep";
import SucessoStep from "./components/SucessoStep";

type Step = "email" | "otp" | "instrucoes" | "foto" | "sucesso";

const STEP_LABELS: Record<Step, string> = {
  email: "E-mail",
  otp: "Verificação",
  instrucoes: "Instruções",
  foto: "Foto",
  sucesso: "Concluído",
};

const STEPS: Step[] = ["email", "otp", "instrucoes", "foto", "sucesso"];

interface WizardFotoPageProps {
  params: Promise<{ codigoInstituicao: string }>;
}

export default function WizardFotoPage({ params }: WizardFotoPageProps) {
  const { codigoInstituicao: codigoInstituicaoStr } = use(params);
  const codigoInstituicao = parseInt(codigoInstituicaoStr, 10);

  const [step, setStep] = useState<Step>("email");
  // wizardToken fica em memória — não persiste em localStorage para não
  // sobreviver a reload em dispositivos compartilhados de balcão.
  const [wizardToken, setWizardToken] = useState<string>("");

  const currentIndex = STEPS.indexOf(step);
  const visibleSteps = STEPS.filter((s) => s !== "sucesso");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo / cabeçalho */}
      <div className="mb-8 text-center">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">
          SchoolGuard
        </h1>
        <p className="text-xs text-gray-400 mt-1">Cadastro de Foto Facial</p>
      </div>

      {/* Indicador de progresso */}
      {step !== "sucesso" && (
        <div className="mb-8 flex items-center gap-2">
          {visibleSteps.map((s, i) => {
            const idx = STEPS.indexOf(s);
            const done = idx < currentIndex;
            const active = s === step;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    done
                      ? "bg-brand-500 text-white"
                      : active
                      ? "bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 ring-2 ring-brand-500"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-400"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </div>
                {i < visibleSteps.length - 1 && (
                  <div
                    className={`h-0.5 w-8 rounded-full transition-colors ${
                      done ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-xl p-8">
        {step === "email" && (
          <EmailStep
            codigoInstituicao={codigoInstituicao}
            onNext={(token) => {
              setWizardToken(token);
              setStep("otp");
            }}
          />
        )}

        {step === "otp" && (
          <OtpStep
            codigoInstituicao={codigoInstituicao}
            wizardToken={wizardToken}
            onNext={(novoToken) => {
              setWizardToken(novoToken);
              setStep("instrucoes");
            }}
          />
        )}

        {step === "instrucoes" && (
          <InstrucoesStep onNext={() => setStep("foto")} />
        )}

        {step === "foto" && (
          <FotoStep
            codigoInstituicao={codigoInstituicao}
            wizardToken={wizardToken}
            onNext={() => setStep("sucesso")}
          />
        )}

        {step === "sucesso" && <SucessoStep />}
      </div>

      {/* Step label */}
      {step !== "sucesso" && (
        <p className="mt-4 text-xs text-gray-400">
          Etapa {currentIndex + 1} de {STEPS.length - 1} —{" "}
          <span className="font-medium">{STEP_LABELS[step]}</span>
        </p>
      )}
    </div>
  );
}
