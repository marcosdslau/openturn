"use client";

import { useEffect, useState } from "react";
import { useCameraCapture } from "@/hooks/useCameraCapture";

interface FotoStepProps {
  codigoInstituicao: number;
  wizardToken: string;
  onNext: () => void;
}

export default function FotoStep({ codigoInstituicao, wizardToken, onNext }: FotoStepProps) {
  const { videoRef, streaming, error: cameraError, start, stop, capture } =
    useCameraCapture();

  const [preview, setPreview] = useState<string | null>(null); // base64 sem prefixo
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCapture() {
    const base64 = capture();
    if (base64) {
      setPreview(base64);
      stop();
    }
  }

  function handleRetake() {
    setPreview(null);
    setSaveError(null);
    start();
  }

  async function handleSave() {
    if (!preview) return;
    setSaveError(null);
    setSaving(true);
    try {
      const { salvarFoto } = await import("@/services/wizard-foto.service");
      await salvarFoto(codigoInstituicao, wizardToken, preview);
      onNext();
    } catch (err) {
      setSaveError(
        (err as Error).message ??
          "Falha ao salvar foto. Verifique sua conexão e tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (cameraError) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
          <span className="text-3xl">📷</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">
            Câmera indisponível
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{cameraError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          {preview ? "Confirmar foto" : "Tirar foto"}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {preview
            ? "Esta é a foto que será salva. Ficou boa?"
            : "Encaixe seu rosto no guia oval e clique para capturar."}
        </p>
      </div>

      {/* Câmera / Preview */}
      <div className="flex flex-col items-center gap-4">
        {preview ? (
          <div className="relative overflow-hidden rounded-full border-4 border-brand-500 shadow-xl w-64 h-64">
            <img
              src={`data:image/jpeg;base64,${preview}`}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl bg-black shadow-xl w-72 h-72">
            {/* Vídeo espelhado */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {/* Máscara oval guia */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg
                viewBox="0 0 288 288"
                className="absolute inset-0 w-full h-full"
                aria-hidden="true"
              >
                <defs>
                  <mask id="oval-mask">
                    <rect width="288" height="288" fill="white" />
                    <ellipse cx="144" cy="144" rx="100" ry="128" fill="black" />
                  </mask>
                </defs>
                {/* Escurecimento fora do oval */}
                <rect
                  width="288"
                  height="288"
                  fill="rgba(0,0,0,0.55)"
                  mask="url(#oval-mask)"
                />
                {/* Borda do oval */}
                <ellipse
                  cx="144"
                  cy="144"
                  rx="100"
                  ry="128"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeDasharray="8 4"
                />
              </svg>
            </div>
            {!streaming && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <p className="text-white text-sm">Iniciando câmera...</p>
              </div>
            )}
          </div>
        )}

        {saveError && (
          <div className="w-full rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
            {saveError}
          </div>
        )}

        {/* Botões */}
        {preview ? (
          <div className="flex w-full gap-3">
            <button
              onClick={handleRetake}
              disabled={saving}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Tirar novamente
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Salvando...
                </span>
              ) : (
                "Salvar"
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={handleCapture}
            disabled={!streaming}
            aria-label="Capturar foto"
            className="h-16 w-16 rounded-full border-4 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl active:scale-95 transition-transform disabled:opacity-40"
          >
            <span className="block h-10 w-10 rounded-full bg-brand-500 mx-auto" />
          </button>
        )}
      </div>
    </div>
  );
}
