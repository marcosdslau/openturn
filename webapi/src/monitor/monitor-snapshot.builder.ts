import { Injectable } from '@nestjs/common';
import { StatusExecucao, TipoRotina } from '@prisma/client';
import { subDays, subHours, startOfDay } from 'date-fns';
import { PrismaService } from '../common/prisma/prisma.service';
import {
    MONITOR_INST_DASHBOARD_CACHE_VERSION,
    type ExecucoesJanelaCurta,
    type InstituicaoMonitorSnapshot,
    type InstituicaoRankingEntry,
    type JanelaCurta,
    type JanelaDuracao,
    type JanelaStatus,
    type MonitorInstituicaoDashboardExtrasCacheDto,
    type MonitorSnapshotDto,
    type SerieBucket,
    type SeriePeriodo,
    type SeriePlataforma,
    type StatusContagem,
    type StatusExecucaoKey,
    type TopRotina,
} from './monitor-snapshot.types';

const JANELAS_CURTAS: JanelaCurta[] = ['1h', '4h', '8h', '16h', '24h', '36h'];
const JANELAS_STATUS: JanelaStatus[] = ['5d', '10d', '15d', '30d', '60d'];
const STATUS_KEYS: StatusExecucaoKey[] = [
    'EM_EXECUCAO',
    'SUCESSO',
    'ERRO',
    'TIMEOUT',
    'CANCELADO',
];

function emptyStatusContagem(): StatusContagem {
    return {
        EM_EXECUCAO: 0,
        SUCESSO: 0,
        ERRO: 0,
        TIMEOUT: 0,
        CANCELADO: 0,
    };
}

function validateTimezone(tz: string): string {
    const t = tz.trim();
    if (!/^[A-Za-z0-9_+\-/]+$/.test(t) || t.length > 64) {
        return 'America/Sao_Paulo';
    }
    return t;
}

function toNum(v: bigint | number | null | undefined): number {
    if (v == null) return 0;
    return typeof v === 'bigint' ? Number(v) : v;
}

function cumulativeSeries(buckets: { bucketStart: string; count: number }[]): SerieBucket[] {
    let acc = 0;
    return buckets.map((b) => {
        acc += b.count;
        return { bucketStart: b.bucketStart, count: b.count, cumulative: acc };
    });
}

@Injectable()
export class MonitorSnapshotBuilder {
    constructor(private readonly prisma: PrismaService) { }

    async build(params: {
        now: Date;
        queue: MonitorSnapshotDto['queue'];
        timezone: string;
    }): Promise<Omit<MonitorSnapshotDto, 'version' | 'generatedAt' | 'refreshDurationMs'>> {
        const { now, queue } = params;
        const tz = validateTimezone(params.timezone);
        const tzEsc = tz.replace(/'/g, "''");

        const cut36h = subHours(now, 36);
        const cut1h = subHours(now, 1);
        const cut4h = subHours(now, 4);
        const cut8h = subHours(now, 8);
        const cut16h = subHours(now, 16);
        const cut24h = subHours(now, 24);
        const cut1d = subDays(now, 1);
        const cut2d = subDays(now, 2);
        const cut5d = subDays(now, 5);
        const cut10d = subDays(now, 10);
        const cut15d = subDays(now, 15);
        const cut30d = subDays(now, 30);
        const cut60d = subDays(now, 60);
        const startHoje = startOfDay(now);
        const cut10h = subHours(now, 10);

        const [
            totalClientes,
            totalInstituicoesCount,
            totalPessoas,
            totalMatriculas,
            totalEquipamentos,
            totalRotinas,
            totalSchedules,
            totalWebhooks,
            totalExecucoes,
            execucoesHoje,
        ] = await Promise.all([
            this.prisma.cLICliente.count(),
            this.prisma.iNSInstituicao.count(),
            this.prisma.pESPessoa.count({ where: { deletedAt: null } }),
            this.prisma.mATMatricula.count(),
            this.prisma.eQPEquipamento.count(),
            this.prisma.rOTRotina.count(),
            this.prisma.rOTRotina.count({ where: { ROTTipo: TipoRotina.SCHEDULE } }),
            this.prisma.rOTRotina.count({ where: { ROTTipo: TipoRotina.WEBHOOK } }),
            this.prisma.rOTExecucaoLog.count(),
            this.prisma.rOTExecucaoLog.count({
                where: { EXEInicio: { gte: startHoje } },
            }),
        ]);

        const instituicoesBase = await this.prisma.iNSInstituicao.findMany({
            select: { INSCodigo: true, INSNome: true },
            orderBy: { INSCodigo: 'asc' },
        });

        const execShortRows = await this.prisma.$queryRaw<
            {
                INSInstituicaoCodigo: number;
                j1h: bigint;
                j4h: bigint;
                j8h: bigint;
                j16h: bigint;
                j24h: bigint;
                j36h: bigint;
            }[]
        >`
            SELECT "INSInstituicaoCodigo",
                COUNT(*) FILTER (WHERE "EXEInicio" >= ${cut1h})::bigint AS j1h,
                COUNT(*) FILTER (WHERE "EXEInicio" >= ${cut4h})::bigint AS j4h,
                COUNT(*) FILTER (WHERE "EXEInicio" >= ${cut8h})::bigint AS j8h,
                COUNT(*) FILTER (WHERE "EXEInicio" >= ${cut16h})::bigint AS j16h,
                COUNT(*) FILTER (WHERE "EXEInicio" >= ${cut24h})::bigint AS j24h,
                COUNT(*) FILTER (WHERE "EXEInicio" >= ${cut36h})::bigint AS j36h
            FROM "ROTExecucaoLog"
            WHERE "EXEInicio" >= ${cut36h}
            GROUP BY "INSInstituicaoCodigo"
        `;

        const durationRows = await this.prisma.$queryRaw<
            {
                INSInstituicaoCodigo: number;
                d1: bigint;
                d2: bigint;
                d5: bigint;
                d10: bigint;
                d15: bigint;
                d30: bigint;
            }[]
        >`
            SELECT "INSInstituicaoCodigo",
                COALESCE(SUM("EXEDuracaoMs") FILTER (
                    WHERE "EXEInicio" >= ${cut1d} AND "EXEDuracaoMs" IS NOT NULL AND "EXEFim" IS NOT NULL
                ), 0)::bigint AS d1,
                COALESCE(SUM("EXEDuracaoMs") FILTER (
                    WHERE "EXEInicio" >= ${cut2d} AND "EXEDuracaoMs" IS NOT NULL AND "EXEFim" IS NOT NULL
                ), 0)::bigint AS d2,
                COALESCE(SUM("EXEDuracaoMs") FILTER (
                    WHERE "EXEInicio" >= ${cut5d} AND "EXEDuracaoMs" IS NOT NULL AND "EXEFim" IS NOT NULL
                ), 0)::bigint AS d5,
                COALESCE(SUM("EXEDuracaoMs") FILTER (
                    WHERE "EXEInicio" >= ${cut10d} AND "EXEDuracaoMs" IS NOT NULL AND "EXEFim" IS NOT NULL
                ), 0)::bigint AS d10,
                COALESCE(SUM("EXEDuracaoMs") FILTER (
                    WHERE "EXEInicio" >= ${cut15d} AND "EXEDuracaoMs" IS NOT NULL AND "EXEFim" IS NOT NULL
                ), 0)::bigint AS d15,
                COALESCE(SUM("EXEDuracaoMs") FILTER (
                    WHERE "EXEInicio" >= ${cut30d} AND "EXEDuracaoMs" IS NOT NULL AND "EXEFim" IS NOT NULL
                ), 0)::bigint AS d30
            FROM "ROTExecucaoLog"
            WHERE "EXEInicio" >= ${cut30d}
            GROUP BY "INSInstituicaoCodigo"
        `;

        const statusStarts: Record<JanelaStatus, Date> = {
            '5d': cut5d,
            '10d': cut10d,
            '15d': cut15d,
            '30d': cut30d,
            '60d': cut60d,
        };

        const statusQueries = await Promise.all(
            JANELAS_STATUS.map((j) =>
                this.prisma.$queryRaw<
                    {
                        INSInstituicaoCodigo: number;
                        EM_EXECUCAO: bigint;
                        SUCESSO: bigint;
                        ERRO: bigint;
                        TIMEOUT: bigint;
                        CANCELADO: bigint;
                    }[]
                >`
                    SELECT "INSInstituicaoCodigo",
                        COUNT(*) FILTER (WHERE "EXEStatus" = 'EM_EXECUCAO'::"StatusExecucao")::bigint AS "EM_EXECUCAO",
                        COUNT(*) FILTER (WHERE "EXEStatus" = 'SUCESSO'::"StatusExecucao")::bigint AS "SUCESSO",
                        COUNT(*) FILTER (WHERE "EXEStatus" = 'ERRO'::"StatusExecucao")::bigint AS "ERRO",
                        COUNT(*) FILTER (WHERE "EXEStatus" = 'TIMEOUT'::"StatusExecucao")::bigint AS "TIMEOUT",
                        COUNT(*) FILTER (WHERE "EXEStatus" = 'CANCELADO'::"StatusExecucao")::bigint AS "CANCELADO"
                    FROM "ROTExecucaoLog"
                    WHERE "EXEInicio" >= ${statusStarts[j]}
                    GROUP BY "INSInstituicaoCodigo"
                `,
            ),
        );

        const top10dRows = await this.prisma.$queryRaw<
            { inst: number; rot: number; nome: string; cnt: bigint; rn: bigint }[]
        >`
            WITH agg AS (
                SELECT e."INSInstituicaoCodigo" AS inst,
                    e."ROTCodigo" AS rot,
                    r."ROTNome" AS nome,
                    COUNT(*)::bigint AS cnt
                FROM "ROTExecucaoLog" e
                INNER JOIN "ROTRotina" r ON r."ROTCodigo" = e."ROTCodigo"
                WHERE e."EXEInicio" >= ${cut10d}
                GROUP BY e."INSInstituicaoCodigo", e."ROTCodigo", r."ROTNome"
            ),
            ranked AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY inst ORDER BY cnt DESC) AS rn
                FROM agg
            )
            SELECT inst, rot, nome, cnt, rn FROM ranked WHERE rn <= 5
            ORDER BY inst, rn
        `;

        const topByWindow: Record<JanelaCurta, { inst: number; rot: number; nome: string; cnt: bigint; rn: bigint }[]> =
            {
                '1h': [],
                '4h': [],
                '8h': [],
                '16h': [],
                '24h': [],
                '36h': [],
            };

        const cutFor: Record<JanelaCurta, Date> = {
            '1h': cut1h,
            '4h': cut4h,
            '8h': cut8h,
            '16h': cut16h,
            '24h': cut24h,
            '36h': cut36h,
        };

        await Promise.all(
            JANELAS_CURTAS.map(async (jw) => {
                const since = cutFor[jw];
                const rows = await this.prisma.$queryRaw<
                    { inst: number; rot: number; nome: string; cnt: bigint; rn: bigint }[]
                >`
                    WITH agg AS (
                        SELECT e."INSInstituicaoCodigo" AS inst,
                            e."ROTCodigo" AS rot,
                            r."ROTNome" AS nome,
                            COUNT(*)::bigint AS cnt
                        FROM "ROTExecucaoLog" e
                        INNER JOIN "ROTRotina" r ON r."ROTCodigo" = e."ROTCodigo"
                        WHERE e."EXEInicio" >= ${since}
                        GROUP BY e."INSInstituicaoCodigo", e."ROTCodigo", r."ROTNome"
                    ),
                    ranked AS (
                        SELECT *, ROW_NUMBER() OVER (PARTITION BY inst ORDER BY cnt DESC) AS rn
                        FROM agg
                    )
                    SELECT inst, rot, nome, cnt, rn FROM ranked WHERE rn <= 20
                    ORDER BY inst, rn
                `;
                topByWindow[jw] = rows;
            }),
        );

        const [pessoasByInst, matriculasByInst] = await Promise.all([
            this.prisma.pESPessoa.groupBy({
                by: ['INSInstituicaoCodigo'],
                where: { deletedAt: null },
                _count: true,
            }),
            this.prisma.mATMatricula.groupBy({
                by: ['INSInstituicaoCodigo'],
                _count: true,
            }),
        ]);

        const execMap = new Map(execShortRows.map((r) => [r.INSInstituicaoCodigo, r]));
        const durMap = new Map(durationRows.map((r) => [r.INSInstituicaoCodigo, r]));
        const pessoaMap = new Map(pessoasByInst.map((r) => [r.INSInstituicaoCodigo, r._count]));
        const matMap = new Map(matriculasByInst.map((r) => [r.INSInstituicaoCodigo, r._count]));

        const statusByInstWindow = new Map<JanelaStatus, Map<number, StatusContagem>>();
        JANELAS_STATUS.forEach((j, idx) => {
            const m = new Map<number, StatusContagem>();
            for (const row of statusQueries[idx]) {
                m.set(row.INSInstituicaoCodigo, {
                    EM_EXECUCAO: toNum(row.EM_EXECUCAO),
                    SUCESSO: toNum(row.SUCESSO),
                    ERRO: toNum(row.ERRO),
                    TIMEOUT: toNum(row.TIMEOUT),
                    CANCELADO: toNum(row.CANCELADO),
                });
            }
            statusByInstWindow.set(j, m);
        });

        const top10dMap = new Map<number, TopRotina[]>();
        for (const row of top10dRows) {
            const list = top10dMap.get(row.inst) ?? [];
            list.push({
                rotinaCodigo: row.rot,
                nome: row.nome,
                execucoes: toNum(row.cnt),
            });
            top10dMap.set(row.inst, list);
        }

        const topShortMap = new Map<JanelaCurta, Map<number, TopRotina[]>>();
        for (const jw of JANELAS_CURTAS) {
            const m = new Map<number, TopRotina[]>();
            for (const row of topByWindow[jw]) {
                const list = m.get(row.inst) ?? [];
                list.push({
                    rotinaCodigo: row.rot,
                    nome: row.nome,
                    execucoes: toNum(row.cnt),
                });
                m.set(row.inst, list);
            }
            topShortMap.set(jw, m);
        }

        const instituicoesOut: InstituicaoMonitorSnapshot[] = instituicoesBase.map((ib) => {
            const c = execMap.get(ib.INSCodigo);
            const execucoesPorJanelaCurta: ExecucoesJanelaCurta = {
                '1h': toNum(c?.j1h),
                '4h': toNum(c?.j4h),
                '8h': toNum(c?.j8h),
                '16h': toNum(c?.j16h),
                '24h': toNum(c?.j24h),
                '36h': toNum(c?.j36h),
            };

            const d = durMap.get(ib.INSCodigo);
            const tempoProcessamentoMsPorJanela = {
                '1d': toNum(d?.d1),
                '2d': toNum(d?.d2),
                '5d': toNum(d?.d5),
                '10d': toNum(d?.d10),
                '15d': toNum(d?.d15),
                '30d': toNum(d?.d30),
            };

            const topRotinasPorJanelaCurta = {} as Record<JanelaCurta, TopRotina[]>;
            for (const jw of JANELAS_CURTAS) {
                topRotinasPorJanelaCurta[jw] = topShortMap.get(jw)?.get(ib.INSCodigo) ?? [];
            }

            const statusPorJanela = {} as Record<JanelaStatus, StatusContagem>;
            for (const j of JANELAS_STATUS) {
                statusPorJanela[j] = statusByInstWindow.get(j)?.get(ib.INSCodigo) ?? emptyStatusContagem();
            }

            return {
                codigo: ib.INSCodigo,
                nome: ib.INSNome,
                pessoas: pessoaMap.get(ib.INSCodigo) ?? 0,
                matriculas: matMap.get(ib.INSCodigo) ?? 0,
                execucoesPorJanelaCurta,
                topRotinasPorJanelaCurta,
                tempoProcessamentoMsPorJanela,
                topRotinas10d: top10dMap.get(ib.INSCodigo) ?? [],
                statusPorJanela,
            };
        });

        const rankingsGlobaisPorStatus = this.buildRankings(instituicoesOut);

        const serieExecucoesPlataforma = await this.buildSeries({
            tzEsc,
            cut10h,
            cut24h,
            cut5d,
            cut15d,
            cut30d,
            instituicaoCodigo: undefined,
        });

        return {
            counts: {
                clientes: totalClientes,
                instituicoes: totalInstituicoesCount,
                pessoas: totalPessoas,
                matriculas: totalMatriculas,
                equipamentos: totalEquipamentos,
                rotinas: {
                    total: totalRotinas,
                    schedules: totalSchedules,
                    webhooks: totalWebhooks,
                },
                execucoes: { total: totalExecucoes, hoje: execucoesHoje },
            },
            queue,
            instituicoes: instituicoesOut,
            rankingsGlobaisPorStatus,
            serieExecucoesPlataforma,
        };
    }

    private buildRankings(
        instituicoes: InstituicaoMonitorSnapshot[],
    ): Record<JanelaStatus, Record<StatusExecucaoKey, InstituicaoRankingEntry[]>> {
        const out = {} as Record<JanelaStatus, Record<StatusExecucaoKey, InstituicaoRankingEntry[]>>;
        for (const j of JANELAS_STATUS) {
            out[j] = {} as Record<StatusExecucaoKey, InstituicaoRankingEntry[]>;
            for (const sk of STATUS_KEYS) {
                const entries: InstituicaoRankingEntry[] = instituicoes
                    .map((i) => ({
                        codigo: i.codigo,
                        nome: i.nome,
                        count: i.statusPorJanela[j][sk],
                    }))
                    .filter((e) => e.count > 0)
                    .sort((a, b) => b.count - a.count);
                out[j][sk] = entries;
            }
        }
        return out;
    }

    /** Série cumulativa de execuções apenas para uma instituição (mesmos períodos do monitor global). */
    async buildSeriesForInstituicao(
        instituicaoCodigo: number,
        now: Date,
        timezone: string,
    ): Promise<SeriePlataforma[]> {
        const tz = validateTimezone(timezone);
        const tzEsc = tz.replace(/'/g, "''");
        const cut10h = subHours(now, 10);
        const cut24h = subHours(now, 24);
        const cut5d = subDays(now, 5);
        const cut15d = subDays(now, 15);
        const cut30d = subDays(now, 30);
        return this.buildSeries({
            tzEsc,
            cut10h,
            cut24h,
            cut5d,
            cut15d,
            cut30d,
            instituicaoCodigo,
        });
    }

    /** Complemento cacheável (Redis): série + contagens e histórico sucesso/erro para a instituição. */
    async buildInstituicaoDashboardExtras(
        instituicaoCodigo: number,
        now: Date,
        timezone: string,
    ): Promise<MonitorInstituicaoDashboardExtrasCacheDto> {
        const tz = validateTimezone(timezone);
        const startHoje = startOfDay(now);
        const [
            serieExecucoesInstituicao,
            execHoje,
            execTotal,
            totalRot,
            sched,
            web,
            equip,
            completed,
            failed,
        ] = await Promise.all([
            this.buildSeriesForInstituicao(instituicaoCodigo, now, tz),
            this.prisma.rOTExecucaoLog.count({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    EXEInicio: { gte: startHoje },
                },
            }),
            this.prisma.rOTExecucaoLog.count({
                where: { INSInstituicaoCodigo: instituicaoCodigo },
            }),
            this.prisma.rOTRotina.count({
                where: { INSInstituicaoCodigo: instituicaoCodigo },
            }),
            this.prisma.rOTRotina.count({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    ROTTipo: TipoRotina.SCHEDULE,
                },
            }),
            this.prisma.rOTRotina.count({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    ROTTipo: TipoRotina.WEBHOOK,
                },
            }),
            this.prisma.eQPEquipamento.count({
                where: { INSInstituicaoCodigo: instituicaoCodigo },
            }),
            this.prisma.rOTExecucaoLog.count({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    EXEStatus: StatusExecucao.SUCESSO,
                },
            }),
            this.prisma.rOTExecucaoLog.count({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    EXEStatus: StatusExecucao.ERRO,
                },
            }),
        ]);

        return {
            version: MONITOR_INST_DASHBOARD_CACHE_VERSION,
            generatedAt: now.toISOString(),
            serieExecucoesInstituicao,
            counts: {
                execucoes: { hoje: execHoje, total: execTotal },
                rotinas: { total: totalRot, schedules: sched, webhooks: web },
                equipamentos: equip,
            },
            queueHistory: { completed, failed },
        };
    }

    private async buildSeries(params: {
        tzEsc: string;
        cut10h: Date;
        cut24h: Date;
        cut5d: Date;
        cut15d: Date;
        cut30d: Date;
        instituicaoCodigo?: number;
    }): Promise<SeriePlataforma[]> {
        const { tzEsc, cut10h, cut24h, cut5d, cut15d, cut30d, instituicaoCodigo } = params;

        const hourQuery = async (since: Date): Promise<{ bucket: string; cnt: bigint }[]> => {
            if (instituicaoCodigo != null) {
                return this.prisma.$queryRawUnsafe<{ bucket: string; cnt: bigint }[]>(
                    `
                    SELECT to_char(
                        date_trunc('hour', "EXEInicio" AT TIME ZONE '${tzEsc}'),
                        'YYYY-MM-DD"T"HH24:00:00'
                    ) AS bucket,
                    COUNT(*)::bigint AS cnt
                    FROM "ROTExecucaoLog"
                    WHERE "EXEInicio" >= $1 AND "INSInstituicaoCodigo" = $2
                    GROUP BY 1
                    ORDER BY 1
                    `,
                    since,
                    instituicaoCodigo,
                );
            }
            return this.prisma.$queryRawUnsafe<{ bucket: string; cnt: bigint }[]>(
                `
                SELECT to_char(
                    date_trunc('hour', "EXEInicio" AT TIME ZONE '${tzEsc}'),
                    'YYYY-MM-DD"T"HH24:00:00'
                ) AS bucket,
                COUNT(*)::bigint AS cnt
                FROM "ROTExecucaoLog"
                WHERE "EXEInicio" >= $1
                GROUP BY 1
                ORDER BY 1
                `,
                since,
            );
        };

        const dayQuery = async (since: Date): Promise<{ bucket: string; cnt: bigint }[]> => {
            if (instituicaoCodigo != null) {
                return this.prisma.$queryRawUnsafe<{ bucket: string; cnt: bigint }[]>(
                    `
                    SELECT to_char(
                        date_trunc('day', "EXEInicio" AT TIME ZONE '${tzEsc}'),
                        'YYYY-MM-DD'
                    ) AS bucket,
                    COUNT(*)::bigint AS cnt
                    FROM "ROTExecucaoLog"
                    WHERE "EXEInicio" >= $1 AND "INSInstituicaoCodigo" = $2
                    GROUP BY 1
                    ORDER BY 1
                    `,
                    since,
                    instituicaoCodigo,
                );
            }
            return this.prisma.$queryRawUnsafe<{ bucket: string; cnt: bigint }[]>(
                `
                SELECT to_char(
                    date_trunc('day', "EXEInicio" AT TIME ZONE '${tzEsc}'),
                    'YYYY-MM-DD'
                ) AS bucket,
                COUNT(*)::bigint AS cnt
                FROM "ROTExecucaoLog"
                WHERE "EXEInicio" >= $1
                GROUP BY 1
                ORDER BY 1
                `,
                since,
            );
        };

        const [h10, h24, d5, d15, d30] = await Promise.all([
            hourQuery(cut10h),
            hourQuery(cut24h),
            dayQuery(cut5d),
            dayQuery(cut15d),
            dayQuery(cut30d),
        ]);

        const pack = (periodo: SeriePeriodo, granularity: 'hour' | 'day', raw: { bucket: string; cnt: bigint }[]): SeriePlataforma => {
            const base = raw.map((r) => ({ bucketStart: r.bucket, count: toNum(r.cnt) }));
            return {
                periodo,
                granularity,
                buckets: cumulativeSeries(base),
            };
        };

        return [
            pack('10h', 'hour', h10),
            pack('24h', 'hour', h24),
            pack('5d', 'day', d5),
            pack('15d', 'day', d15),
            pack('30d', 'day', d30),
        ];
    }
}
