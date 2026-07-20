"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { apiGet } from "@/lib/api";

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigoInstituicao: number;
}

export default function QrCodeModal({ isOpen, onClose, codigoInstituicao }: QrCodeModalProps) {
  const [loadingPng, setLoadingPng] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadFile(format: "png" | "pdf") {
    setError(null);
    const setter = format === "png" ? setLoadingPng : setLoadingPdf;
    setter(true);

    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"}/instituicao/${codigoInstituicao}/wizard-foto/qrcode.${format}`;
      const token = typeof window !== "undefined" ? localStorage.getItem("openturn_token") : null;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Erro ${res.status} ao gerar ${format.toUpperCase()}`);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `qrcode-wizard-foto-${codigoInstituicao}.${format}`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError((err as Error).message ?? "Erro ao baixar arquivo.");
    } finally {
      setter(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-sm p-6 rounded-2xl">
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/20">
            <span className="text-2xl">📲</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            QR Code de Autoatendimento
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Baixe o QR Code para disponibilizar o cadastro de foto por autoatendimento.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => downloadFile("png")}
            disabled={loadingPng || loadingPdf}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <span>🖼️</span>
            {loadingPng ? "Gerando..." : "Baixar PNG"}
          </button>

          <button
            onClick={() => downloadFile("pdf")}
            disabled={loadingPng || loadingPdf}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            <span>📄</span>
            {loadingPdf ? "Gerando..." : "Baixar PDF"}
          </button>
        </div>

        <button
          onClick={onClose}
          className="text-center text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Fechar
        </button>
      </div>
    </Modal>
  );
}
