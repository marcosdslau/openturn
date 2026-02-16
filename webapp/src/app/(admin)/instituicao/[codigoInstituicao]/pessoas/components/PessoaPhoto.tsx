"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { UserCircleIcon, VideoIcon, FileIcon, ChevronLeftIcon, CheckCircleIcon } from "@/icons";

interface PessoaPhotoProps {
    base64?: string | null;
    extensao?: string | null;
    onChange: (base64: string | null, extensao: string | null) => void;
    onConfirm?: (base64: string | null, extensao: string | null) => Promise<void>;
}

type Handle = "nw" | "ne" | "sw" | "se" | "move" | null;

export default function PessoaPhoto({ base64, extensao, onChange, onConfirm }: PessoaPhotoProps) {
    const photoModal = useModal();
    const confirmModal = useModal();
    const [mode, setMode] = useState<"menu" | "webcam" | "upload" | "crop">("menu");
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [croppedImage, setCroppedImage] = useState<string | null>(null);
    const [croppedResolution, setCroppedResolution] = useState<{ width: number; height: number } | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    // Cropping state (percentage based for responsiveness)
    const [crop, setCrop] = useState({ x: 10, y: 10, width: 80, height: 80 });
    const [isDragging, setIsDragging] = useState<Handle>(null);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 });

    const openModal = () => {
        setMode("menu");
        setCroppedImage(null);
        photoModal.openModal();
    };

    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const closePhotoModal = () => {
        stopStream();
        photoModal.closeModal();
    };

    const startWebcam = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
            });
            setStream(mediaStream);
            setMode("webcam");
        } catch (err) {
            console.error("Erro ao acessar a webcam", err);
            alert("Não foi possível acessar a webcam. Verifique as permissões do navegador.");
        }
    };

    // Use effect to attach stream when mode switches and video ref is available
    useEffect(() => {
        if (mode === "webcam" && stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error("Erro ao iniciar preview", e));
        }
    }, [mode, stream]);

    const capturePhoto = () => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
            const canvas = document.createElement("canvas");
            // Use real video dimensions
            canvas.width = videoRef.current.videoWidth || 640;
            canvas.height = videoRef.current.videoHeight || 480;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                // Flip horizontally to match preview
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(videoRef.current, 0, 0);
                const dataUrl = canvas.toDataURL("image/png");
                setOriginalImage(dataUrl);
                setMode("crop");
                stopStream();
                setCrop({ x: 20, y: 10, width: 60, height: 80 });
            }
        } else {
            alert("Aguarde o carregamento da câmera...");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 1.9 * 1024 * 1024) {
                alert("A imagem deve ter no máximo 1.9MB.");
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                setOriginalImage(dataUrl);
                setMode("crop");
                setCrop({ x: 20, y: 10, width: 60, height: 80 });
            };
            reader.readAsDataURL(file);
        }
    };

    const onMouseDown = (e: React.MouseEvent | React.TouchEvent, handle: Handle) => {
        e.preventDefault();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        setIsDragging(handle);
        setDragStart({
            x: clientX,
            y: clientY,
            cropX: crop.x,
            cropY: crop.y,
            cropW: crop.width,
            cropH: crop.height,
        });
    };

    const onMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!isDragging || !imageRef.current) return;

        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        const rect = imageRef.current.getBoundingClientRect();
        const dx = ((clientX - dragStart.x) / rect.width) * 100;
        const dy = ((clientY - dragStart.y) / rect.height) * 100;

        // Clear preview on interaction
        setCroppedImage(null);
        setCroppedResolution(null);

        setCrop(prev => {
            let next = { ...prev };

            if (isDragging === "move") {
                next.x = Math.max(0, Math.min(100 - prev.width, dragStart.cropX + dx));
                next.y = Math.max(0, Math.min(100 - prev.height, dragStart.cropY + dy));
            } else {
                // Resize logic with basic constraints
                if (isDragging.includes("w")) {
                    const newW = Math.max(10, dragStart.cropW - dx);
                    next.x = dragStart.cropX + (dragStart.cropW - newW);
                    next.width = newW;
                }
                if (isDragging.includes("e")) {
                    next.width = Math.max(10, dragStart.cropW + dx);
                }
                if (isDragging.includes("n")) {
                    const newH = Math.max(10, dragStart.cropH - dy);
                    next.y = dragStart.cropY + (dragStart.cropH - newH);
                    next.height = newH;
                }
                if (isDragging.includes("s")) {
                    next.height = Math.max(10, dragStart.cropH + dy);
                }

                // Keep within bounds
                next.x = Math.max(0, next.x);
                next.y = Math.max(0, next.y);
                if (next.x + next.width > 100) next.width = 100 - next.x;
                if (next.y + next.height > 100) next.height = 100 - next.y;
            }

            return next;
        });
    }, [isDragging, dragStart]);

    const onMouseUp = useCallback(() => {
        setIsDragging(null);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
            window.addEventListener("touchmove", onMouseMove);
            window.addEventListener("touchend", onMouseUp);
        }
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("touchmove", onMouseMove);
            window.removeEventListener("touchend", onMouseUp);
        };
    }, [isDragging, onMouseMove, onMouseUp]);

    const applyCrop = () => {
        if (!originalImage || !canvasRef.current || !imageRef.current) return;
        const img = new Image();
        img.onload = () => {
            const canvas = canvasRef.current!;

            // Calculate actual pixel coordinates
            const realX = (crop.x / 100) * img.width;
            const realY = (crop.y / 100) * img.height;
            const realW = (crop.width / 100) * img.width;
            const realH = (crop.height / 100) * img.height;

            // Enforce resolution limits (Min 160x160, Max 1920x1080)
            canvas.width = Math.min(Math.max(realW, 160), 1080);
            canvas.height = Math.min(Math.max(realH, 160), 1920);

            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(img, realX, realY, realW, realH, 0, 0, canvas.width, canvas.height);
                const finalBase64 = canvas.toDataURL("image/png");
                setCroppedImage(finalBase64);
                setCroppedResolution({ width: canvas.width, height: canvas.height });
            }
        };
        img.src = originalImage;
    };

    const confirmPhoto = async () => {
        if (croppedImage) {
            const pureBase64 = croppedImage.split(",")[1];

            if (onConfirm) {
                setIsConfirming(true);
                try {
                    await onConfirm(pureBase64, "png");
                    onChange(pureBase64, "png");
                    closePhotoModal();
                } catch (error) {
                    console.error("Erro ao salvar foto no backend", error);
                    alert("Erro ao salvar a foto. Tente novamente.");
                } finally {
                    setIsConfirming(false);
                }
            } else {
                onChange(pureBase64, "png");
                closePhotoModal();
            }
        }
    };

    const handleRemovePhoto = () => {
        confirmModal.openModal();
    };

    const performRemovePhoto = async () => {
        if (onConfirm) {
            setIsConfirming(true);
            try {
                await onConfirm(null, null);
                onChange(null, null);
                confirmModal.closeModal();
            } catch (error) {
                console.error("Erro ao remover foto no backend", error);
                alert("Erro ao remover a foto. Tente novamente.");
            } finally {
                setIsConfirming(false);
            }
        } else {
            onChange(null, null);
            confirmModal.closeModal();
        }
    };

    const renderPreview = () => {
        const displayUrl = base64 ? `data:image/${extensao || "png"};base64,${base64}` : null;
        return (
            <div className="flex flex-col items-center gap-4">
                <div className="relative group">
                    {displayUrl ? (
                        <div className="w-[180px] h-[240px] rounded-xl overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg bg-gray-100 dark:bg-gray-800">
                            <img src={displayUrl} alt="Pessoa" className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div className="w-[180px] h-[240px] flex items-center justify-center bg-gray-50 dark:bg-white/[0.03] rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                            <div className="w-[150px] h-[150px] flex items-center justify-center text-gray-300 dark:text-gray-600">
                                <UserCircleIcon className="" />
                            </div>
                        </div>
                    )}
                </div>
                <Button size="sm" variant="outline" onClick={openModal} type="button" className="w-full">
                    {base64 ? "Alterar Foto" : "Adicionar Foto"}
                </Button>
                {base64 && (
                    <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={isConfirming}
                        className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                    >
                        {isConfirming ? "Removendo..." : "Remover Foto"}
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col items-center">
            {renderPreview()}

            <Modal
                isOpen={photoModal.isOpen}
                onClose={closePhotoModal}
                className="max-w-xl p-0 overflow-hidden rounded-2xl"
            >
                <div className="bg-white dark:bg-gray-900 flex flex-col max-h-[90vh]">
                    <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2">
                            {mode !== "menu" && (
                                <button onClick={() => { stopStream(); setMode("menu"); setCroppedImage(null); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                                    <ChevronLeftIcon className="w-5 h-5" />
                                </button>
                            )}
                            <h3 className="font-semibold text-gray-800 dark:text-white">
                                {mode === "menu" ? "Escolher Opção" : mode === "webcam" ? "Tirar Foto" : "Recortar Foto"}
                            </h3>
                        </div>
                        <button onClick={closePhotoModal} className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
                    </div>

                    <div className="p-6 overflow-y-auto min-h-[400px]">
                        {mode === "menu" && (
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={startWebcam} className="flex flex-col items-center justify-center p-8 gap-4 rounded-2xl border-2 border-gray-50 dark:border-gray-800 hover:border-brand-500 transition-all group">
                                    <VideoIcon className="w-10 h-10 text-gray-400 group-hover:text-brand-500" />
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">Tirar Foto</span>
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-8 gap-4 rounded-2xl border-2 border-gray-50 dark:border-gray-800 hover:border-brand-500 transition-all group">
                                    <FileIcon className="w-10 h-10 text-gray-400 group-hover:text-brand-500" />
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">Carregar</span>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                                </button>
                            </div>
                        )}

                        {mode === "webcam" && (
                            <div className="space-y-6 flex flex-col items-center">
                                <div className="relative bg-black rounded-2xl overflow-hidden aspect-[3/4] max-w-[320px] shadow-2xl">
                                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                                    <div className="absolute inset-0 border-[40px] border-black/40">
                                        <div className="w-full h-full border-2 border-white/60 rounded-lg"></div>
                                    </div>
                                </div>
                                <button onClick={capturePhoto} className="w-16 h-16 bg-white border-4 border-gray-100 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all">
                                    <div className="w-12 h-12 bg-brand-500 rounded-full"></div>
                                </button>
                            </div>
                        )}

                        {mode === "crop" && (
                            <div className="space-y-6">
                                <div className="relative flex justify-center bg-gray-50 dark:bg-black/40 rounded-2xl p-4 overflow-hidden select-none touch-none">
                                    <div className="relative inline-block max-h-[400px]">
                                        <img ref={imageRef} src={originalImage!} alt="Crop" className="max-w-full block shadow-lg pointer-events-none" />

                                        {/* Crop Area Overlay */}
                                        <div
                                            className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] cursor-move"
                                            onMouseDown={(e) => onMouseDown(e, "move")}
                                            onTouchStart={(e) => onMouseDown(e, "move")}
                                            style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }}
                                        >
                                            <div className="w-full h-full border border-white/30 grid grid-cols-3 grid-rows-3">
                                                {[...Array(9)].map((_, i) => <div key={i} className="border-[0.5px] border-white/20"></div>)}
                                            </div>
                                            {/* Handles */}
                                            {["nw", "ne", "sw", "se"].map(h => (
                                                <div key={h}
                                                    onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, h as Handle); }}
                                                    onTouchStart={(e) => { e.stopPropagation(); onMouseDown(e, h as Handle); }}
                                                    className={`absolute w-4 h-4 bg-brand-500 border-2 border-white rounded-full 
                                                   ${h === "nw" ? "-top-2 -left-2 cursor-nwse-resize" : ""}
                                                   ${h === "ne" ? "-top-2 -right-2 cursor-nesw-resize" : ""}
                                                   ${h === "sw" ? "-bottom-2 -left-2 cursor-nesw-resize" : ""}
                                                   ${h === "se" ? "-bottom-2 -right-2 cursor-nwse-resize" : ""}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-center gap-6">
                                    <canvas ref={canvasRef} className="hidden" />
                                    {croppedImage ? (
                                        <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ajustado</p>
                                            <img src={croppedImage} className="w-24 h-32 object-cover rounded-xl shadow-xl ring-4 ring-green-500/20" />
                                            {croppedResolution && (
                                                <p className="text-[10px] font-mono text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                                                    {croppedResolution.width} × {croppedResolution.height} px
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500 text-center italic">Arraste os cantos para redimensionar o recorte.</p>
                                    )}

                                    <div className="flex gap-3 w-full sm:w-auto">
                                        <Button variant="outline" onClick={() => { setMode("menu"); setCroppedImage(null); }} className="flex-1 sm:flex-none">Cancelar</Button>
                                        {!croppedImage ? (
                                            <Button onClick={applyCrop} className="flex-1 sm:flex-none">Aplicar Recorte</Button>
                                        ) : (
                                            <Button
                                                onClick={confirmPhoto}
                                                className="gap-2 flex-1 sm:flex-none bg-brand-600 hover:bg-brand-700"
                                                disabled={isConfirming}
                                            >
                                                {isConfirming ? (
                                                    <span className="flex items-center gap-2">
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                        Salvando...
                                                    </span>
                                                ) : (
                                                    <>
                                                        <CheckCircleIcon className="w-4 h-4" />
                                                        Gravar Foto
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* Confirmation Modal for Removal */}
            <Modal
                isOpen={confirmModal.isOpen}
                onClose={confirmModal.closeModal}
                className="max-w-md p-6 rounded-2xl"
            >
                <div className="flex flex-col items-center gap-6 text-center">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                        <UserCircleIcon className="w-10 h-10 text-red-500" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Remover Foto?</h3>
                        <p className="text-gray-500 dark:text-gray-400">Esta ação não pode ser desfeita. Deseja realmente remover a foto desta pessoa?</p>
                    </div>
                    <div className="flex gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={confirmModal.closeModal}
                            className="flex-1"
                            disabled={isConfirming}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={performRemovePhoto}
                            className="bg-red-500 hover:bg-red-600 flex-1"
                            disabled={isConfirming}
                        >
                            {isConfirming ? "Removendo..." : "Confirmar Remoção"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
