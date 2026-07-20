"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCameraCaptureReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  streaming: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  capture: () => string | null;
}

/**
 * Hook que encapsula a lógica de câmera via getUserMedia.
 * Retorna um frame em JPEG base64 (sem o prefixo data:...) com recorte
 * central quadrado 1:1 — adequado para o wizard de cadastro de foto facial.
 *
 * Não inclui upload de arquivo nem crop manual por arraste (esses são
 * exclusivos do componente PessoaPhoto.tsx da área administrativa).
 */
export function useCameraCapture(): UseCameraCaptureReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreaming(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 1280 },
          facingMode: "user",
        },
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
      setStreaming(true);
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permissão de câmera negada. Habilite o acesso à câmera nas configurações do navegador."
          : "Não foi possível acessar a câmera. Verifique se ela está disponível e tente novamente.";
      setError(msg);
      setStreaming(false);
    }
  }, []);

  /**
   * Captura o frame atual do vídeo e retorna o base64 JPEG puro (sem prefixo
   * data:image/jpeg;base64,). O recorte é central quadrado para garantir 1:1.
   */
  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 640;
    const size = Math.min(vw, vh);
    const sx = Math.floor((vw - size) / 2);
    const sy = Math.floor((vh - size) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Espelha horizontalmente para coincidir com o preview
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    return dataUrl.split(",")[1] ?? null;
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { videoRef, streaming, error, start, stop, capture };
}
