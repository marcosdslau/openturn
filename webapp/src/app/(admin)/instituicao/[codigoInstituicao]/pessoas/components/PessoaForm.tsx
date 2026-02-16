"use client";

import React from "react";
import Button from "@/components/ui/button/Button";
import PessoaPhoto from "./PessoaPhoto";

interface PessoaFormProps {
    initialData?: any;
    onSubmit: (data: any) => void;
    onCancel: () => void;
    loading?: boolean;
    onSavePhoto?: (base64: string | null, extensao: string | null) => Promise<void>;
}

export default function PessoaForm({ initialData, onSubmit, onCancel, loading, onSavePhoto }: PessoaFormProps) {
    const [formData, setFormData] = React.useState({
        PESNome: initialData?.PESNome || "",
        PESNomeSocial: initialData?.PESNomeSocial || "",
        PESDocumento: initialData?.PESDocumento || "",
        PESEmail: initialData?.PESEmail || "",
        PESTelefone: initialData?.PESTelefone || "",
        PESCelular: initialData?.PESCelular || "",
        PESIdExterno: initialData?.PESIdExterno || "",
        PESGrupo: initialData?.PESGrupo || "",
        PESCartaoTag: initialData?.PESCartaoTag || "",
        PESAtivo: initialData?.PESAtivo ?? true,
        PESFotoBase64: initialData?.PESFotoBase64 || null,
        PESFotoExtensao: initialData?.PESFotoExtensao || null,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target as any;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? (e.target as any).checked : value,
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const inputClasses = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none disabled:bg-gray-100 dark:disabled:bg-gray-900";
    const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

    const handlePhotoChange = (base64: string | null, extensao: string | null) => {
        setFormData(prev => ({ ...prev, PESFotoBase64: base64, PESFotoExtensao: extensao }));
    };

    return (
        <div className="flex flex-col md:flex-row gap-6">
            {/* Photo Column */}
            <div className="w-full md:w-48 flex-shrink-0">
                <PessoaPhoto
                    base64={formData.PESFotoBase64}
                    extensao={formData.PESFotoExtensao}
                    onChange={handlePhotoChange}
                    onConfirm={onSavePhoto}
                />
            </div>

            {/* Form Column */}
            <form onSubmit={handleSubmit} className="flex-1 space-y-6 bg-white dark:bg-white/[0.03] p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Nome */}
                    <div className="md:col-span-2">
                        <label className={labelClasses}>Nome Completo *</label>
                        <input
                            name="PESNome"
                            value={formData.PESNome}
                            onChange={handleChange}
                            required
                            placeholder="Ex: João Silva"
                            className={inputClasses}
                            disabled={loading}
                        />
                    </div>

                    {/* Nome Social */}
                    <div>
                        <label className={labelClasses}>Nome Social</label>
                        <input
                            name="PESNomeSocial"
                            value={formData.PESNomeSocial}
                            onChange={handleChange}
                            placeholder="Como a pessoa prefere ser chamada"
                            className={inputClasses}
                            disabled={loading}
                        />
                    </div>

                    {/* Documento */}
                    <div>
                        <label className={labelClasses}>Documento (CPF/CNPJ)</label>
                        <input
                            name="PESDocumento"
                            value={formData.PESDocumento}
                            onChange={handleChange}
                            placeholder="Apenas números"
                            className={inputClasses}
                            disabled={loading}
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className={labelClasses}>Email</label>
                        <input
                            name="PESEmail"
                            type="email"
                            value={formData.PESEmail}
                            onChange={handleChange}
                            placeholder="exemplo@email.com"
                            className={inputClasses}
                            disabled={loading}
                        />
                    </div>

                    {/* Id Externo */}
                    <div>
                        <label className={labelClasses}>ID Externo</label>
                        <input
                            name="PESIdExterno"
                            value={formData.PESIdExterno}
                            onChange={handleChange}
                            placeholder="Código em outro sistema"
                            className={inputClasses}
                            disabled={loading}
                        />
                    </div>

                    {/* Telefone */}
                    <div>
                        <label className={labelClasses}>Telefone Fixo</label>
                        <input
                            name="PESTelefone"
                            value={formData.PESTelefone}
                            onChange={handleChange}
                            placeholder="(00) 0000-0000"
                            className={inputClasses}
                            disabled={loading}
                        />
                    </div>

                    {/* Celular */}
                    <div>
                        <label className={labelClasses}>Celular</label>
                        <input
                            name="PESCelular"
                            value={formData.PESCelular}
                            onChange={handleChange}
                            placeholder="(00) 00000-0000"
                            className={inputClasses}
                            disabled={loading}
                        />
                    </div>

                    {/* Grupo */}
                    <div>
                        <label className={labelClasses}>Grupo</label>
                        <input
                            name="PESGrupo"
                            value={formData.PESGrupo}
                            onChange={handleChange}
                            placeholder="Ex: Alunos, Professores"
                            className={inputClasses}
                            disabled={loading}
                        />
                    </div>

                    {/* Cartão Tag */}
                    <div>
                        <label className={labelClasses}>Cartão / Tag (RFID)</label>
                        <input
                            name="PESCartaoTag"
                            value={formData.PESCartaoTag}
                            onChange={handleChange}
                            placeholder="Identificador da TAG"
                            className={inputClasses}
                            disabled={loading}
                        />
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-3 pt-6">
                        <input
                            id="PESAtivo"
                            name="PESAtivo"
                            type="checkbox"
                            checked={formData.PESAtivo}
                            onChange={handleChange}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            disabled={loading}
                        />
                        <label htmlFor="PESAtivo" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Registro Ativo
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <Button variant="outline" onClick={onCancel} type="button" disabled={loading}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={loading || !formData.PESNome}>
                        {loading ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
