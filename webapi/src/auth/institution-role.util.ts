import { GrupoAcesso } from '@prisma/client';

const GLOBAL_GRUPOS: string[] = [
  GrupoAcesso.SUPER_ROOT,
  GrupoAcesso.SUPER_ADMIN,
];

export function isGlobalAcessoUser(
  user: { acessos?: { grupo: string }[] } | undefined,
): boolean {
  return !!user?.acessos?.some((a) => GLOBAL_GRUPOS.includes(a.grupo));
}

export function institutionGrupoForUser(
  user:
    | { acessos?: { grupo: string; instituicaoId: number | null }[] }
    | undefined,
  instituicaoCodigo: number,
): GrupoAcesso | null {
  const match = user?.acessos?.find(
    (a) => a.instituicaoId === instituicaoCodigo,
  );
  if (!match) return null;
  return match.grupo as GrupoAcesso;
}

export function parseInstituicaoCodigoFromRequest(
  params: Record<string, string | undefined>,
): number | null {
  const raw = params.instituicaoCodigo ?? params.codigoInstituicao;
  if (raw === undefined || raw === '') return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}
