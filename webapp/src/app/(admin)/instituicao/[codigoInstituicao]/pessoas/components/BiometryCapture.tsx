
import React, { useState, useEffect } from "react";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useTenant } from "@/context/TenantContext";

interface BiometryCaptureProps {
    personId: number;
}

interface Device {
    EQPCodigo: number;
    EQPDescricao: string;
    EQPMarca: string;
    EQPAtivo: boolean;
}

export default function BiometryCapture({ personId }: BiometryCaptureProps) {
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [enrollType, setEnrollType] = useState<'face' | 'biometry'>('face');
    const [selectedDevice, setSelectedDevice] = useState<number | null>(null);

    // Fetch devices on mount (or when modal opens to be fresh)
    useEffect(() => {
        if (modalOpen) {
            apiGet<{ data: Device[] }>(`/instituicao/${codigoInstituicao}/equipamento?limit=100`)
                .then(res => {
                    const controlIdDevices = res.data.filter(d => d.EQPMarca === 'ControlID' && d.EQPAtivo);
                    setDevices(controlIdDevices);
                    if (controlIdDevices.length > 0) {
                        setSelectedDevice(controlIdDevices[0].EQPCodigo);
                    }
                })
                .catch(err => console.error("Failed to load devices", err));
        }
    }, [modalOpen, codigoInstituicao]);

    const handleOpen = (type: 'face' | 'biometry') => {
        setEnrollType(type);
        setModalOpen(true);
    };

    const handleEnroll = async () => {
        if (!selectedDevice) return;
        setLoading(true);
        try {
            await apiPost(`/instituicao/${codigoInstituicao}/hardware/controlid/enroll`, {
                deviceId: selectedDevice,
                userId: personId,
                type: enrollType
            });
            showToast("success", "Comando enviado", `Dirija-se ao equipamento para capturar ${enrollType === 'face' ? 'a face' : 'a digital'}.`);
            setModalOpen(false);
        } catch (error: any) {
            showToast("error", "Erro ao iniciar captura", error.message || "Falha na comunicação com o equipamento.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Biometria & Acesso</h3>
            <div className="flex gap-3">
                <Button type="button" size="sm" variant="outline" onClick={() => handleOpen('face')}>
                    Capturar Face (Remoto)
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => handleOpen('biometry')}>
                    Capturar Digital (Remoto)
                </Button>
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} className="max-w-sm p-6">
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                        Capturar {enrollType === 'face' ? 'Face' : 'Digital'}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Selecione o equipamento onde deseja realizar a captura.
                    </p>

                    {devices.length === 0 ? (
                        <p className="text-sm text-red-500">Nenhum equipamento ControlID ativo encontrado.</p>
                    ) : (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Equipamento</label>
                            <select
                                value={selectedDevice || ''}
                                onChange={(e) => setSelectedDevice(Number(e.target.value))}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none"
                            >
                                {devices.map(d => (
                                    <option key={d.EQPCodigo} value={d.EQPCodigo}>{d.EQPDescricao}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button type="button" size="sm" onClick={handleEnroll} disabled={loading || !selectedDevice || devices.length === 0}>
                            {loading ? "Enviando..." : "Iniciar Captura"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
