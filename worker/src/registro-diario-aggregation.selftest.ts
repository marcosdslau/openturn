import { AcaoPassagem } from '@prisma/client';
import {
    buildPassagemDayGroups,
    aggregateEntradaSaida,
    aggregateTempoPermanencia,
    aggregateTempoPermanenciaPeriodo,
    type PassagemParaAgregacao,
    type PeriodoConfig,
} from './registro-diario-aggregation.helpers';

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(`aggregation selftest: ${msg}`);
}

// ---------------------------------------------------------------------------
// Helpers de construção de passagens
// ---------------------------------------------------------------------------

function mk(
    codigo: number,
    pes: number,
    iso: string,
    acao: AcaoPassagem,
): PassagemParaAgregacao {
    return { REGCodigo: codigo, PESCodigo: pes, REGDataHora: new Date(iso), REGAcao: acao };
}
const E = AcaoPassagem.ENTRADA;
const S = AcaoPassagem.SAIDA;

// ---------------------------------------------------------------------------
// 1. Selftests legados — buildPassagemDayGroups
// ---------------------------------------------------------------------------

const base = new Date('2025-06-10T12:00:00.000Z');
const rows: PassagemParaAgregacao[] = [
    { REGCodigo: 1, PESCodigo: 100, REGDataHora: base, REGAcao: AcaoPassagem.ENTRADA },
    {
        REGCodigo: 2,
        PESCodigo: 100,
        REGDataHora: new Date(base.getTime() + 2 * 3600000),
        REGAcao: AcaoPassagem.ENTRADA,
    },
    { REGCodigo: 3, PESCodigo: 200, REGDataHora: base, REGAcao: AcaoPassagem.SAIDA },
];

const m = buildPassagemDayGroups(rows);
assert(m.size === 2, `expected 2 groups, got ${m.size}`);
for (const g of m.values()) {
    if (g.PESCodigo === 100) {
        assert(g.codigos.length === 2, 'pessoa 100 should have 2 codigos');
        assert(g.minEntrada?.getTime() === base.getTime(), 'minEntrada should be first ENTRADA');
        assert(g.maxSaida === null, 'pessoa 100 has no SAIDA');
    }
    if (g.PESCodigo === 200) {
        assert(g.minEntrada === null, 'pessoa 200 only SAIDA');
        assert(g.maxSaida?.getTime() === base.getTime(), 'maxSaida should be SAIDA time');
    }
}

const mix: PassagemParaAgregacao[] = [
    {
        REGCodigo: 20,
        PESCodigo: 1,
        REGDataHora: new Date('2025-06-10T08:00:00.000Z'),
        REGAcao: AcaoPassagem.SAIDA,
    },
    {
        REGCodigo: 21,
        PESCodigo: 1,
        REGDataHora: new Date('2025-06-10T10:00:00.000Z'),
        REGAcao: AcaoPassagem.ENTRADA,
    },
];
const mMix = buildPassagemDayGroups(mix);
assert(mMix.size === 1, 'one group');
const gMix = [...mMix.values()][0];
assert(
    gMix.minEntrada?.getTime() === new Date('2025-06-10T10:00:00.000Z').getTime(),
    'entrada ignores earlier SAIDA',
);
assert(
    gMix.maxSaida?.getTime() === new Date('2025-06-10T08:00:00.000Z').getTime(),
    'saida keeps SAIDA time',
);

const sameDayOtherPerson: PassagemParaAgregacao[] = [
    {
        REGCodigo: 10,
        PESCodigo: 1,
        REGDataHora: new Date('2025-01-10T03:00:00.000Z'),
        REGAcao: AcaoPassagem.ENTRADA,
    },
    {
        REGCodigo: 11,
        PESCodigo: 1,
        REGDataHora: new Date('2025-01-10T23:00:00.000Z'),
        REGAcao: AcaoPassagem.SAIDA,
    },
];
const m2 = buildPassagemDayGroups(sameDayOtherPerson);
assert(m2.size === 1, 'same person same UTC calendar day => 1 group');
const gLast = [...m2.values()][0];
assert(
    gLast.minEntrada?.getTime() === new Date('2025-01-10T03:00:00.000Z').getTime(),
    'first entrada',
);
assert(
    gLast.maxSaida?.getTime() === new Date('2025-01-10T23:00:00.000Z').getTime(),
    'last saida',
);
assert(
    gLast.dataLocal.getTime() === Date.UTC(2025, 0, 10, 12, 0, 0, 0),
    'RPDData anchor: meio-dia UTC do dia civil',
);

const earlyUtcApril30: PassagemParaAgregacao[] = [
    {
        REGCodigo: 99,
        PESCodigo: 42,
        REGDataHora: new Date('2026-04-30T02:00:00.000Z'),
        REGAcao: AcaoPassagem.ENTRADA,
    },
];
const mEarly = buildPassagemDayGroups(earlyUtcApril30);
assert(mEarly.size === 1, 'early UTC still same UTC date');
const gEarly = [...mEarly.values()][0];
assert(
    gEarly.dataLocal.getTime() === Date.UTC(2026, 3, 30, 12, 0, 0, 0),
    '2026-04-30 02:00 UTC => RPDData 30/04, not 29/04',
);

// ---------------------------------------------------------------------------
// 2. aggregateEntradaSaida — regressão
// ---------------------------------------------------------------------------

{
    // Usa 2026-06-10 para evitar colisão de PES com selftests acima (pes=1)
    const passagens: PassagemParaAgregacao[] = [
        mk(101, 1, '2026-06-10T07:00:00.000Z', E),
        mk(102, 1, '2026-06-10T09:00:00.000Z', E),
        mk(103, 1, '2026-06-10T20:36:00.000Z', S),
    ];
    const janelas = aggregateEntradaSaida(passagens);
    assert(janelas.length === 1, 'entrada_saida: 1 janela');
    assert(janelas[0].RPDJanelaIndice === 1, 'entrada_saida: indice=1');
    assert(janelas[0].RPDDataEntrada?.getTime() === new Date('2026-06-10T07:00:00.000Z').getTime(), 'entrada_saida: min entrada');
    assert(janelas[0].RPDDataSaida?.getTime() === new Date('2026-06-10T20:36:00.000Z').getTime(), 'entrada_saida: max saida');
    assert(janelas[0].PERCodigo === null, 'entrada_saida: PERCodigo null');
}

// ---------------------------------------------------------------------------
// 3. aggregateTempoPermanencia — P2-C: 17:03 E, 17:30 E, 20:36 S → 1 janela 17:03–20:36
// ---------------------------------------------------------------------------

{
    // Ordem real no banco = cronológica (P2-C: banco ordena por REGDataHora)
    const passagens: PassagemParaAgregacao[] = [
        mk(1, 5, '2026-06-11T17:03:00.000Z', E),
        mk(2, 5, '2026-06-11T17:30:00.000Z', E),
        mk(3, 5, '2026-06-11T20:36:00.000Z', S),
    ];
    const janelas = aggregateTempoPermanencia(passagens);
    assert(janelas.length === 1, 'P2-C: deve gerar 1 janela');
    assert(janelas[0].RPDDataEntrada?.getTime() === new Date('2026-06-11T17:03:00.000Z').getTime(), 'P2-C: entrada = 17:03 (P1-A)');
    assert(janelas[0].RPDDataSaida?.getTime() === new Date('2026-06-11T20:36:00.000Z').getTime(), 'P2-C: saida = 20:36');
}

// ---------------------------------------------------------------------------
// 4. aggregateTempoPermanencia — P3-B: 08:00 S, 10:00 E, 18:00 S → 2 janelas
// ---------------------------------------------------------------------------

{
    const passagens: PassagemParaAgregacao[] = [
        mk(10, 5, '2026-06-12T08:00:00.000Z', S),
        mk(11, 5, '2026-06-12T10:00:00.000Z', E),
        mk(12, 5, '2026-06-12T18:00:00.000Z', S),
    ];
    const janelas = aggregateTempoPermanencia(passagens);
    assert(janelas.length === 2, 'P3-B: 2 janelas');

    const orfaNula = janelas.find((j) => j.RPDDataEntrada === null);
    assert(!!orfaNula, 'P3-B: janela órfã com entrada null');
    assert(orfaNula!.RPDDataSaida?.getTime() === new Date('2026-06-12T08:00:00.000Z').getTime(), 'P3-B: órfã saida=08:00');

    const normal = janelas.find((j) => j.RPDDataEntrada !== null);
    assert(!!normal, 'P3-B: janela normal com entrada');
    assert(normal!.RPDDataEntrada?.getTime() === new Date('2026-06-12T10:00:00.000Z').getTime(), 'P3-B: normal entrada=10:00');
    assert(normal!.RPDDataSaida?.getTime() === new Date('2026-06-12T18:00:00.000Z').getTime(), 'P3-B: normal saida=18:00');
}

// ---------------------------------------------------------------------------
// 5. aggregateTempoPermanencia — exemplo completo PO (14 passagens, 5 janelas)
// ---------------------------------------------------------------------------
// Passagens (ordem cronológica conforme banco):
//  07:00 E, 08:50 S → janela 1: 07:00–08:50
//  09:00 E, 09:01 E, 12:35 S → janela 2: 09:00–12:35
//  13:00 E, 13:03 E, 14:50 S → janela 3: 13:00–14:50
//  15:00 E, 15:01 E, 17:00 S, 17:02 S → janela 4: 15:00–17:02
//  17:03 E, 17:30 E, 20:36 S → janela 5: 17:03–20:36

{
    const D = '2026-06-13';
    const passagens: PassagemParaAgregacao[] = [
        mk(201, 7, `${D}T07:00:00.000Z`, E),
        mk(202, 7, `${D}T08:50:00.000Z`, S),
        mk(203, 7, `${D}T09:00:00.000Z`, E),
        mk(204, 7, `${D}T09:01:00.000Z`, E),
        mk(205, 7, `${D}T12:35:00.000Z`, S),
        mk(206, 7, `${D}T13:00:00.000Z`, E),
        mk(207, 7, `${D}T13:03:00.000Z`, E),
        mk(208, 7, `${D}T14:50:00.000Z`, S),
        mk(209, 7, `${D}T15:00:00.000Z`, E),
        mk(210, 7, `${D}T15:01:00.000Z`, E),
        mk(211, 7, `${D}T17:00:00.000Z`, S),
        mk(212, 7, `${D}T17:02:00.000Z`, S),
        mk(213, 7, `${D}T17:03:00.000Z`, E),
        mk(214, 7, `${D}T17:30:00.000Z`, E),
        mk(215, 7, `${D}T20:36:00.000Z`, S),
    ];
    const janelas = aggregateTempoPermanencia(passagens);
    assert(janelas.length === 5, `PO 5 janelas: got ${janelas.length}`);

    const sorted = [...janelas].sort((a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice);
    const esperadas = [
        { e: `${D}T07:00:00.000Z`, s: `${D}T08:50:00.000Z` },
        { e: `${D}T09:00:00.000Z`, s: `${D}T12:35:00.000Z` },
        { e: `${D}T13:00:00.000Z`, s: `${D}T14:50:00.000Z` },
        { e: `${D}T15:00:00.000Z`, s: `${D}T17:02:00.000Z` },
        { e: `${D}T17:03:00.000Z`, s: `${D}T20:36:00.000Z` },
    ];
    for (let i = 0; i < esperadas.length; i++) {
        const j = sorted[i];
        assert(
            j.RPDDataEntrada?.getTime() === new Date(esperadas[i].e).getTime(),
            `PO janela ${i + 1} entrada esperada ${esperadas[i].e} got ${j.RPDDataEntrada?.toISOString()}`,
        );
        assert(
            j.RPDDataSaida?.getTime() === new Date(esperadas[i].s).getTime(),
            `PO janela ${i + 1} saida esperada ${esperadas[i].s} got ${j.RPDDataSaida?.toISOString()}`,
        );
    }
}

// ---------------------------------------------------------------------------
// 6. aggregateTempoPermanenciaPeriodo — períodos PO com tolerância 1h (60 min)
// ---------------------------------------------------------------------------
// Períodos: Manhã 05:00–12:00, Tarde 12:01–18:00, Noite 18:01–23:59 (todos tol 60 min)
// Passagens (UTC -3 → local = UTC+3h... mas o fuso aqui é -3, então local=UTC-3)
// Para fuso = -3: passagem às 10:00 UTC = 07:00 local
// Usando fuso -3 (BRT). Passagens em UTC; local = UTC - 3h.
// Manhã efetivo (com tol 60): 04:00–13:00 local = 07:00–16:00 UTC
// Tarde efetivo: 11:01–19:00 local = 14:01–22:00 UTC
// Noite efetivo: 17:01–24:59 local = 20:01–03:59 UTC
// Vamos simplificar usando fuso=0 para que local=UTC e facilitar os asserts:

{
    const periodos: PeriodoConfig[] = [
        { PERCodigo: 10, PERHorarioInicio: '07:00', PERHorarioFim: '12:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
        { PERCodigo: 20, PERHorarioInicio: '12:01', PERHorarioFim: '18:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
        { PERCodigo: 30, PERHorarioInicio: '18:01', PERHorarioFim: '23:59', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
    ];
    const D = '2026-06-14';
    // fuso=0 → local=UTC; horários das passagens são diretamente comparáveis com HH:mm
    const passagens: PassagemParaAgregacao[] = [
        mk(301, 9, `${D}T07:00:00.000Z`, E),
        mk(302, 9, `${D}T12:35:00.000Z`, S),  // Manhã: 07:00–12:35 (dentro 07:00–12:00? 12:35>12:00 → fora)
        mk(303, 9, `${D}T13:00:00.000Z`, E),  // Tarde
        mk(304, 9, `${D}T17:02:00.000Z`, S),  // Tarde
        mk(305, 9, `${D}T17:30:00.000Z`, E),  // Noite (depois de 18:01? não... 17:30 < 18:01)
        mk(306, 9, `${D}T20:36:00.000Z`, S),  // Noite
    ];
    // Reanalisando: 12:35 não cabe em Manhã (fim=12:00), cai em Tarde (12:01–18:00 OK)
    // 07:00 E → Manhã (07:00–12:00), nenhuma saída dentro do Manhã → janela com saída null? não, 12:35 caiu em Tarde
    // Passagens por período:
    //   Manhã: 07:00 E (só ela)
    //   Tarde: 12:35 S, 13:00 E, 17:02 S, 17:30 E
    //   Noite: 20:36 S

    const janelas = aggregateTempoPermanenciaPeriodo(passagens, periodos, 0);
    assert(janelas.length === 3, `período 3 janelas: got ${janelas.length}`);

    const jManha = janelas.find((j) => j.PERCodigo === 10);
    assert(!!jManha, 'janela manhã existe');
    assert(jManha!.RPDDataEntrada?.getTime() === new Date(`${D}T07:00:00.000Z`).getTime(), 'manhã entrada=07:00');
    assert(jManha!.RPDDataSaida === null, 'manhã sem saída');

    const jTarde = janelas.find((j) => j.PERCodigo === 20);
    assert(!!jTarde, 'janela tarde existe');
    assert(jTarde!.RPDDataEntrada?.getTime() === new Date(`${D}T13:00:00.000Z`).getTime(), 'tarde entrada=13:00');
    // max(SAIDA) em Tarde: 12:35 e 17:02; 17:30 é ENTRADA
    assert(jTarde!.RPDDataSaida?.getTime() === new Date(`${D}T17:02:00.000Z`).getTime(), 'tarde saida=17:02');

    const jNoite = janelas.find((j) => j.PERCodigo === 30);
    assert(!!jNoite, 'janela noite existe');
    assert(jNoite!.RPDDataEntrada === null, 'noite sem entrada');
    assert(jNoite!.RPDDataSaida?.getTime() === new Date(`${D}T20:36:00.000Z`).getTime(), 'noite saida=20:36');
}

// ---------------------------------------------------------------------------
// 7. aggregateTempoPermanenciaPeriodo — P4-A: passagem orphan fora de qualquer período
// ---------------------------------------------------------------------------

{
    const periodos: PeriodoConfig[] = [
        { PERCodigo: 1, PERHorarioInicio: '08:00', PERHorarioFim: '12:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
        { PERCodigo: 2, PERHorarioInicio: '13:00', PERHorarioFim: '18:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
    ];
    const D = '2026-06-15';
    // 06:00 fora de ambos os períodos → janela extra PERCodigo=null
    const passagens: PassagemParaAgregacao[] = [
        mk(401, 11, `${D}T06:00:00.000Z`, E),   // orphan
        mk(402, 11, `${D}T09:00:00.000Z`, E),   // Manhã
        mk(403, 11, `${D}T11:00:00.000Z`, S),   // Manhã
        mk(404, 11, `${D}T14:00:00.000Z`, E),   // Tarde
        mk(405, 11, `${D}T17:00:00.000Z`, S),   // Tarde
    ];

    const janelas = aggregateTempoPermanenciaPeriodo(passagens, periodos, 0);
    assert(janelas.length === 3, `P4-A: 3 janelas (2 períodos + 1 extra): got ${janelas.length}`);

    const extra = janelas.find((j) => j.PERCodigo === null);
    assert(!!extra, 'P4-A: janela extra PERCodigo=null existe');
    assert(extra!.RPDDataEntrada?.getTime() === new Date(`${D}T06:00:00.000Z`).getTime(), 'P4-A: orphan entrada=06:00');
    assert(extra!.RPDDataSaida === null, 'P4-A: orphan sem saída');

    const jM = janelas.find((j) => j.PERCodigo === 1);
    assert(!!jM, 'P4-A: janela período 1 existe');
    assert(jM!.RPDDataEntrada?.getTime() === new Date(`${D}T09:00:00.000Z`).getTime(), 'P4-A: manhã entrada=09:00');
    assert(jM!.RPDDataSaida?.getTime() === new Date(`${D}T11:00:00.000Z`).getTime(), 'P4-A: manhã saida=11:00');
}

// ---------------------------------------------------------------------------
// 8. aggregateTempoPermanenciaPeriodo — tolerância inclui passagem extra
// ---------------------------------------------------------------------------

{
    // Manhã nominal 08:00–12:00, tolerância entrada 60 min → captura início a partir 07:00
    const periodos: PeriodoConfig[] = [
        {
            PERCodigo: 5,
            PERHorarioInicio: '08:00',
            PERHorarioFim: '12:00',
            PERToleranciaEntradaMinutos: 60,
            PERToleranciaSaidaMinutos: 0,
        },
    ];
    const D = '2026-06-16';
    const passagens: PassagemParaAgregacao[] = [
        mk(501, 13, `${D}T07:30:00.000Z`, E),  // dentro da tolerância (07:00 ≤ 07:30 ≤ 12:00)
        mk(502, 13, `${D}T11:00:00.000Z`, S),
    ];

    const janelas = aggregateTempoPermanenciaPeriodo(passagens, periodos, 0);
    assert(janelas.length === 1, 'tolerância: 1 janela com tolerância entrada');
    assert(janelas[0].PERCodigo === 5, 'tolerância: PERCodigo correto');
    assert(janelas[0].RPDDataEntrada?.getTime() === new Date(`${D}T07:30:00.000Z`).getTime(), 'tolerância: entrada=07:30');
}

console.log('registro-diario-aggregation selftest OK');
