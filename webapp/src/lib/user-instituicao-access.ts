/** Dados mínimos de acesso vindos do token /auth/me para montar escopo de instituições. */
export type AcessoComInstituicao = {
    clienteId: number | null;
    instituicaoId: number | null;
    instituicaoNome?: string | null;
};

export type InstituicaoListaItem = {
    INSCodigo: number;
    INSNome: string;
    INSAtivo: boolean;
    CLICodigo: number;
};

/** Primeira instituição vinculada ao usuário (para redirect após login). */
export function firstAccessibleInstituicaoId(
    acessos: AcessoComInstituicao[] | undefined | null,
): number | undefined {
    const id = acessos?.find((a) => a.instituicaoId != null)?.instituicaoId;
    return id == null ? undefined : id;
}

/** Lista única de instituições que o usuário pode escolher (sem chamar GET /instituicoes). */
export function buildInstituicoesListFromAcessos(
    acessos: AcessoComInstituicao[] | undefined | null,
): InstituicaoListaItem[] {
    const byId = new Map<number, InstituicaoListaItem>();
    for (const a of acessos ?? []) {
        if (a.instituicaoId == null) continue;
        if (!byId.has(a.instituicaoId)) {
            byId.set(a.instituicaoId, {
                INSCodigo: a.instituicaoId,
                INSNome:
                    (a.instituicaoNome && a.instituicaoNome.trim()) ||
                    `Instituição ${a.instituicaoId}`,
                INSAtivo: true,
                CLICodigo: a.clienteId ?? 0,
            });
        }
    }
    return [...byId.values()].sort((x, y) =>
        x.INSNome.localeCompare(y.INSNome, "pt", { sensitivity: "base" }),
    );
}
