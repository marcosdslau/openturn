import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";

export interface Rotina {
    ROTCodigo: number;
    ROTNome: string;
    ROTDescricao?: string;
    ROTTipo: "SCHEDULE" | "WEBHOOK";
    ROTCronExpressao?: string;
    ROTWebhookPath?: string;
    ROTWebhookMetodo?: "GET" | "POST" | "PUT" | "PATCH";
    ROTWebhookAguardar?: boolean;
    ROTWebhookSeguro: boolean;
    ROTWebhookTokenSource?: "HEADER" | "QUERY";
    ROTWebhookTokenKey?: string;
    ROTWebhookToken?: string;
    ROTCodigoJS: string;
    ROTAtivo: boolean;
    ROTTimeoutSeconds: number;
    ROTUltimaExecucao?: Date;
    INSInstituicaoCodigo: number;
    createdAt: Date;
    updatedAt: Date;
    criador: {
        USRCodigo: number;
        USRNome: string;
        USREmail: string;
    };
    _count?: {
        execucoes: number;
        versoes: number;
    };
}

export interface RotinaVersao {
    HVICodigo: number;
    ROTCodigo: number;
    HVICodigoJS: string;
    HVIObservacao?: string;
    createdAt: Date;
    criador: {
        USRCodigo: number;
        USRNome: string;
    };
}

export type CreateRotinaDto = Omit<Rotina, "ROTCodigo" | "createdAt" | "updatedAt" | "criador" | "_count" | "ROTUltimaExecucao"> & {
    observacao?: string;
};

export type UpdateRotinaDto = Partial<CreateRotinaDto>;

export const RotinaService = {
    getAll: async (instituicaoCodigo: number) => {
        return apiGet<Rotina[]>(`/instituicao/${instituicaoCodigo}/rotina`);
    },

    getById: async (id: number, instituicaoCodigo: number) => {
        return apiGet<Rotina>(`/instituicao/${instituicaoCodigo}/rotina/${id}`);
    },

    create: async (payload: CreateRotinaDto) => {
        return apiPost<Rotina>(`/instituicao/${payload.INSInstituicaoCodigo}/rotina`, payload);
    },

    update: async (id: number, payload: UpdateRotinaDto) => {
        const instituicaoCodigo = payload.INSInstituicaoCodigo; // Ensure this is present in update payload
        return apiPut<Rotina>(`/instituicao/${instituicaoCodigo}/rotina/${id}`, payload);
    },

    delete: async (id: number, instituicaoCodigo: number) => {
        return apiDelete(`/instituicao/${instituicaoCodigo}/rotina/${id}`);
    },

    execute: async (id: number, instituicaoCodigo: number) => {
        return apiPost(`/instituicao/${instituicaoCodigo}/rotina/${id}/execute`, {});
    },

    getVersions: async (id: number, instituicaoCodigo: number) => {
        return apiGet<RotinaVersao[]>(`/instituicao/${instituicaoCodigo}/rotina/${id}/versions`);
    },

    restoreVersion: async (versionId: number, instituicaoCodigo: number) => {
        return apiPost(`/instituicao/${instituicaoCodigo}/rotina/versions/${versionId}/restore`, {});
    },

    deleteVersion: async (versionId: number, instituicaoCodigo: number) => {
        return apiDelete(`/instituicao/${instituicaoCodigo}/rotina/versions/${versionId}`);
    },

    deleteVersions: async (versionIds: number[], instituicaoCodigo: number) => {
        return apiDelete(`/instituicao/${instituicaoCodigo}/rotina/versions/bulk`, { ids: versionIds });
    },
};
