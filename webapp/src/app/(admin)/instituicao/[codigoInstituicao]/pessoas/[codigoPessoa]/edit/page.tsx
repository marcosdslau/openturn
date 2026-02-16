"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPatch } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import PessoaForm from "../../components/PessoaForm";
import { ChevronLeftIcon } from "@/icons";

export default function EditPessoaPage() {
    const params = useParams();
    const router = useRouter();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [pessoa, setPessoa] = useState<any>(null);

    const codigoInstituicao = params.codigoInstituicao;
    const codigoPessoa = params.codigoPessoa;

    useEffect(() => {
        async function loadPessoa() {
            try {
                const res = await apiGet<any>(`/instituicao/${codigoInstituicao}/pessoa/${codigoPessoa}`);
                setPessoa(res);
            } catch (error: any) {
                showToast("error", "Erro ao carregar", error.message || "Não foi possível carregar os dados da pessoa.");
                router.push(`/instituicao/${codigoInstituicao}/pessoas`);
            } finally {
                setLoading(false);
            }
        }
        loadPessoa();
    }, [codigoInstituicao, codigoPessoa, showToast, router]);

    const handleSubmit = async (data: any) => {
        setSaving(true);
        try {
            await apiPatch(`/instituicao/${codigoInstituicao}/pessoa/${codigoPessoa}`, data);
            showToast("success", "Sucesso", "Pessoa atualizada com sucesso.");
            router.push(`/instituicao/${codigoInstituicao}/pessoas`);
        } catch (error: any) {
            showToast("error", "Erro ao salvar", error.message || "Ocorreu um erro ao salvar as alterações.");
        } finally {
            setSaving(false);
        }
    };

    const handleSavePhoto = async (base64: string | null, extensao: string | null) => {
        try {
            await apiPatch(`/instituicao/${codigoInstituicao}/pessoa/${codigoPessoa}`, {
                PESFotoBase64: base64,
                PESFotoExtensao: extensao
            });
            showToast("success", "Sucesso", "Foto atualizada no servidor.");
        } catch (error: any) {
            showToast("error", "Erro ao salvar foto", error.message || "Não foi possível persistir a foto.");
            throw error; // Re-throw to inform PessoaPhoto
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <p className="text-gray-500">Carregando dados...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => router.push(`/instituicao/${codigoInstituicao}/pessoas`)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors"
                >
                    <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Editar Pessoa</h1>
                    <p className="text-sm text-gray-500">Atualize as informações do cadastro</p>
                </div>
            </div>

            <PessoaForm
                initialData={pessoa}
                onSubmit={handleSubmit}
                onCancel={() => router.push(`/instituicao/${codigoInstituicao}/pessoas`)}
                loading={saving}
                onSavePhoto={handleSavePhoto}
            />
        </div>
    );
}
