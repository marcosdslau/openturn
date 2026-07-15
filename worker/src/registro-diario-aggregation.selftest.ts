import { AcaoPassagem } from '@prisma/client';
import {
    buildPassagemDayGroups,
    aggregateEntradaSaida,
    aggregateTempoPermanencia,
    aggregateTempoPermanenciaPeriodo,
    collectJanelasForLocalDay,
    diaOverlapsLocalToday,
    getInstitutionLocalDayBounds,
    planReconciliacao,
    type PassagemParaAgregacao,
    type PeriodoConfig,
    type JanelaAgregada,
    type RpdExistente,
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
// 6. aggregateTempoPermanenciaPeriodo — state machine + atribuição de período
// ---------------------------------------------------------------------------
// Com o novo algoritmo, passagens são pareadas pela state machine antes de
// atribuir PERCodigo. Sem autoComplete, as janelas mantêm os horários reais
// do pareamento e recebem PERCodigo pela hora da entrada.

{
    const periodos: PeriodoConfig[] = [
        { PERCodigo: 10, PERHorarioInicio: '07:00', PERHorarioFim: '12:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
        { PERCodigo: 20, PERHorarioInicio: '12:01', PERHorarioFim: '18:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
        { PERCodigo: 30, PERHorarioInicio: '18:01', PERHorarioFim: '23:59', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
    ];
    const D = '2026-06-14';
    // fuso=0 → local=UTC
    // State machine: window(07:00,12:35) + window(13:00,17:02) + window(17:30,20:36)
    // PERCodigo by entry: Manhã(10), Tarde(20), Tarde(20) — 17:30 < 18:01
    const passagens: PassagemParaAgregacao[] = [
        mk(301, 9, `${D}T07:00:00.000Z`, E),
        mk(302, 9, `${D}T12:35:00.000Z`, S),
        mk(303, 9, `${D}T13:00:00.000Z`, E),
        mk(304, 9, `${D}T17:02:00.000Z`, S),
        mk(305, 9, `${D}T17:30:00.000Z`, E),
        mk(306, 9, `${D}T20:36:00.000Z`, S),
    ];

    const janelas = aggregateTempoPermanenciaPeriodo(passagens, periodos, 0);
    assert(janelas.length === 3, `período 3 janelas: got ${janelas.length}`);

    const sorted = [...janelas].sort((a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice);

    assert(sorted[0].PERCodigo === 10, 'janela 1 PERCodigo=Manhã');
    assert(sorted[0].RPDDataEntrada?.getTime() === new Date(`${D}T07:00:00.000Z`).getTime(), 'janela 1 entrada=07:00');
    assert(sorted[0].RPDDataSaida?.getTime() === new Date(`${D}T12:35:00.000Z`).getTime(), 'janela 1 saida=12:35');

    assert(sorted[1].PERCodigo === 20, 'janela 2 PERCodigo=Tarde');
    assert(sorted[1].RPDDataEntrada?.getTime() === new Date(`${D}T13:00:00.000Z`).getTime(), 'janela 2 entrada=13:00');
    assert(sorted[1].RPDDataSaida?.getTime() === new Date(`${D}T17:02:00.000Z`).getTime(), 'janela 2 saida=17:02');

    assert(sorted[2].PERCodigo === 20, 'janela 3 PERCodigo=Tarde (17:30 < 18:01)');
    assert(sorted[2].RPDDataEntrada?.getTime() === new Date(`${D}T17:30:00.000Z`).getTime(), 'janela 3 entrada=17:30');
    assert(sorted[2].RPDDataSaida?.getTime() === new Date(`${D}T20:36:00.000Z`).getTime(), 'janela 3 saida=20:36');
}

// ---------------------------------------------------------------------------
// 7. aggregateTempoPermanenciaPeriodo — P4-A: passagem orphan fora de qualquer período
// ---------------------------------------------------------------------------
// State machine agrupa 06:00 E + 09:00 E (P1-A) + 11:00 S em uma janela.
// Entrada 06:00 < 08:00 → fora de todos os períodos → PERCodigo=null.

{
    const periodos: PeriodoConfig[] = [
        { PERCodigo: 1, PERHorarioInicio: '08:00', PERHorarioFim: '12:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
        { PERCodigo: 2, PERHorarioInicio: '13:00', PERHorarioFim: '18:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
    ];
    const D = '2026-06-15';
    const passagens: PassagemParaAgregacao[] = [
        mk(401, 11, `${D}T06:00:00.000Z`, E),   // fora de período
        mk(402, 11, `${D}T09:00:00.000Z`, E),   // P1-A: janela ainda aberta (06:00 sem SAIDA)
        mk(403, 11, `${D}T11:00:00.000Z`, S),   // fecha janela → window(06:00, 11:00)
        mk(404, 11, `${D}T14:00:00.000Z`, E),
        mk(405, 11, `${D}T17:00:00.000Z`, S),
    ];

    const janelas = aggregateTempoPermanenciaPeriodo(passagens, periodos, 0);
    assert(janelas.length === 2, `P4-A: 2 janelas: got ${janelas.length}`);

    const sorted = [...janelas].sort((a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice);

    assert(sorted[0].PERCodigo === null, 'P4-A: janela 1 orphan PERCodigo=null');
    assert(sorted[0].RPDDataEntrada?.getTime() === new Date(`${D}T06:00:00.000Z`).getTime(), 'P4-A: orphan entrada=06:00');
    assert(sorted[0].RPDDataSaida?.getTime() === new Date(`${D}T11:00:00.000Z`).getTime(), 'P4-A: orphan saida=11:00');

    assert(sorted[1].PERCodigo === 2, 'P4-A: janela 2 PERCodigo=Tarde');
    assert(sorted[1].RPDDataEntrada?.getTime() === new Date(`${D}T14:00:00.000Z`).getTime(), 'P4-A: tarde entrada=14:00');
    assert(sorted[1].RPDDataSaida?.getTime() === new Date(`${D}T17:00:00.000Z`).getTime(), 'P4-A: tarde saida=17:00');
}

// ---------------------------------------------------------------------------
// 8. aggregateTempoPermanenciaPeriodo — tolerância inclui passagem extra
// ---------------------------------------------------------------------------

{
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
        mk(501, 13, `${D}T07:30:00.000Z`, E),  // nominal 07:30<08:00, efetivo 07:30>=07:00
        mk(502, 13, `${D}T11:00:00.000Z`, S),
    ];

    const janelas = aggregateTempoPermanenciaPeriodo(passagens, periodos, 0);
    assert(janelas.length === 1, 'tolerância: 1 janela com tolerância entrada');
    assert(janelas[0].PERCodigo === 5, 'tolerância: PERCodigo correto');
    assert(janelas[0].RPDDataEntrada?.getTime() === new Date(`${D}T07:30:00.000Z`).getTime(), 'tolerância: entrada=07:30');
    assert(janelas[0].RPDDataSaida?.getTime() === new Date(`${D}T11:00:00.000Z`).getTime(), 'tolerância: saida=11:00');
}

// ---------------------------------------------------------------------------
// 9. Bug-fix — cenário Liliany com autoComplete=true (fuso -3)
// ---------------------------------------------------------------------------
// Passagens locais: 15:54 E, 18:15 S, 18:54 E
// State machine: window(15:54,18:15) + window(18:54,null)
// Split window(15:54,18:15): Tarde(15:54→17:35) + Noite(17:36→18:15)
// window(18:54,null): Noite → auto-complete saída=23:00

{
    const periodos: PeriodoConfig[] = [
        { PERCodigo: 103, PERHorarioInicio: '05:00', PERHorarioFim: '12:02', PERToleranciaEntradaMinutos: 30, PERToleranciaSaidaMinutos: 30 },
        { PERCodigo: 104, PERHorarioInicio: '12:03', PERHorarioFim: '17:35', PERToleranciaEntradaMinutos: 30, PERToleranciaSaidaMinutos: 30 },
        { PERCodigo: 105, PERHorarioInicio: '17:36', PERHorarioFim: '23:00', PERToleranciaEntradaMinutos: 30, PERToleranciaSaidaMinutos: 30 },
    ];
    const D = '2026-07-03';
    const passagens: PassagemParaAgregacao[] = [
        mk(601, 144, `${D}T18:54:56.000Z`, E),  // local 15:54
        mk(602, 144, `${D}T21:15:59.000Z`, S),  // local 18:15
        mk(603, 144, `${D}T21:54:56.000Z`, E),  // local 18:54
    ];

    const janelas = aggregateTempoPermanenciaPeriodo(passagens, periodos, -3, {
        autoComplete: true,
        nowUtc: new Date('2026-07-04T12:00:00.000Z'),
    });

    assert(janelas.length === 3, `bug-fix AC=true: 3 janelas, got ${janelas.length}`);
    const sorted = [...janelas].sort((a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice);

    assert(sorted[0].PERCodigo === 104, 'bug-fix AC: j1 PERCodigo=Tarde');
    assert(sorted[0].RPDDataEntrada?.getTime() === new Date(`${D}T18:54:56.000Z`).getTime(), 'bug-fix AC: j1 entrada');
    assert(sorted[0].RPDDataSaida?.getTime() === new Date(`${D}T20:35:00.000Z`).getTime(), 'bug-fix AC: j1 saida=17:35 BRT');

    assert(sorted[1].PERCodigo === 105, 'bug-fix AC: j2 PERCodigo=Noite');
    assert(sorted[1].RPDDataEntrada?.getTime() === new Date(`${D}T20:36:00.000Z`).getTime(), 'bug-fix AC: j2 entrada=17:36 BRT');
    assert(sorted[1].RPDDataSaida?.getTime() === new Date(`${D}T21:15:59.000Z`).getTime(), 'bug-fix AC: j2 saida');

    assert(sorted[2].PERCodigo === 105, 'bug-fix AC: j3 PERCodigo=Noite');
    assert(sorted[2].RPDDataEntrada?.getTime() === new Date(`${D}T21:54:56.000Z`).getTime(), 'bug-fix AC: j3 entrada');
    assert(sorted[2].RPDDataSaida?.getTime() === new Date('2026-07-04T02:00:00.000Z').getTime(), 'bug-fix AC: j3 saida=23:00 BRT');
}

// ---------------------------------------------------------------------------
// 10. Bug-fix — cenário Liliany com autoComplete=false
// ---------------------------------------------------------------------------
// State machine mantém pareamento real: window(15:54,18:15) + window(18:54,null)
// PERCodigo by entry: Tarde (15:54) + Noite (18:54)

{
    const periodos: PeriodoConfig[] = [
        { PERCodigo: 103, PERHorarioInicio: '05:00', PERHorarioFim: '12:02', PERToleranciaEntradaMinutos: 30, PERToleranciaSaidaMinutos: 30 },
        { PERCodigo: 104, PERHorarioInicio: '12:03', PERHorarioFim: '17:35', PERToleranciaEntradaMinutos: 30, PERToleranciaSaidaMinutos: 30 },
        { PERCodigo: 105, PERHorarioInicio: '17:36', PERHorarioFim: '23:00', PERToleranciaEntradaMinutos: 30, PERToleranciaSaidaMinutos: 30 },
    ];
    const D = '2026-07-03';
    const passagens: PassagemParaAgregacao[] = [
        mk(701, 144, `${D}T18:54:56.000Z`, E),
        mk(702, 144, `${D}T21:15:59.000Z`, S),
        mk(703, 144, `${D}T21:54:56.000Z`, E),
    ];

    const janelas = aggregateTempoPermanenciaPeriodo(passagens, periodos, -3);
    assert(janelas.length === 2, `bug-fix AC=false: 2 janelas, got ${janelas.length}`);

    const sorted = [...janelas].sort((a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice);

    assert(sorted[0].PERCodigo === 104, 'bug-fix noAC: j1 PERCodigo=Tarde');
    assert(sorted[0].RPDDataEntrada?.getTime() === new Date(`${D}T18:54:56.000Z`).getTime(), 'bug-fix noAC: j1 entrada');
    assert(sorted[0].RPDDataSaida?.getTime() === new Date(`${D}T21:15:59.000Z`).getTime(), 'bug-fix noAC: j1 saida');

    assert(sorted[1].PERCodigo === 105, 'bug-fix noAC: j2 PERCodigo=Noite');
    assert(sorted[1].RPDDataEntrada?.getTime() === new Date(`${D}T21:54:56.000Z`).getTime(), 'bug-fix noAC: j2 entrada');
    assert(sorted[1].RPDDataSaida === null, 'bug-fix noAC: j2 saida=null');
}

// ---------------------------------------------------------------------------
// 11. Window cruzando 3 períodos com autoComplete=true
// ---------------------------------------------------------------------------

{
    const periodos: PeriodoConfig[] = [
        { PERCodigo: 41, PERHorarioInicio: '07:00', PERHorarioFim: '12:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
        { PERCodigo: 42, PERHorarioInicio: '12:01', PERHorarioFim: '17:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
        { PERCodigo: 43, PERHorarioInicio: '17:01', PERHorarioFim: '23:00', PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
    ];
    const D = '2026-06-20';
    const passagens: PassagemParaAgregacao[] = [
        mk(801, 50, `${D}T08:00:00.000Z`, E),
        mk(802, 50, `${D}T22:00:00.000Z`, S),
    ];

    const janelas = aggregateTempoPermanenciaPeriodo(passagens, periodos, 0, {
        autoComplete: true,
        nowUtc: new Date('2026-06-21T12:00:00.000Z'),
    });

    assert(janelas.length === 3, `3-períodos AC: 3 janelas, got ${janelas.length}`);
    const sorted = [...janelas].sort((a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice);

    assert(sorted[0].PERCodigo === 41, '3-per: j1 Manhã');
    assert(sorted[0].RPDDataEntrada?.getTime() === new Date(`${D}T08:00:00.000Z`).getTime(), '3-per: j1 entrada=08:00');
    assert(sorted[0].RPDDataSaida?.getTime() === new Date(`${D}T12:00:00.000Z`).getTime(), '3-per: j1 saida=12:00');

    assert(sorted[1].PERCodigo === 42, '3-per: j2 Tarde');
    assert(sorted[1].RPDDataEntrada?.getTime() === new Date(`${D}T12:01:00.000Z`).getTime(), '3-per: j2 entrada=12:01');
    assert(sorted[1].RPDDataSaida?.getTime() === new Date(`${D}T17:00:00.000Z`).getTime(), '3-per: j2 saida=17:00');

    assert(sorted[2].PERCodigo === 43, '3-per: j3 Noite');
    assert(sorted[2].RPDDataEntrada?.getTime() === new Date(`${D}T17:01:00.000Z`).getTime(), '3-per: j3 entrada=17:01');
    assert(sorted[2].RPDDataSaida?.getTime() === new Date(`${D}T22:00:00.000Z`).getTime(), '3-per: j3 saida=22:00');
}

// ---------------------------------------------------------------------------
// 5. Reconciliação do dia atual
// ---------------------------------------------------------------------------

function mkJanela(indice: number, entrada: string, saida: string): JanelaAgregada {
    const dataLocal = new Date('2026-07-09T12:00:00.000Z');
    return {
        PESCodigo: 100,
        dataLocal,
        RPDJanelaIndice: indice,
        RPDDataEntrada: new Date(entrada),
        RPDDataSaida: new Date(saida),
        PERCodigo: null,
        codigosPassagem: [indice],
    };
}

{
    const existentes: RpdExistente[] = [
        { RPDCodigo: 1, RPDJanelaIndice: 1, RPDStatus: 'MANUAL', RPDDataEntrada: new Date('2026-07-09T08:00:00.000Z'), RPDDataSaida: new Date('2026-07-09T12:00:00.000Z'), PERCodigo: null },
        { RPDCodigo: 2, RPDJanelaIndice: 2, RPDStatus: 'PENDENTE', RPDDataEntrada: new Date('2026-07-09T13:00:00.000Z'), RPDDataSaida: new Date('2026-07-09T17:00:00.000Z'), PERCodigo: null },
    ];
    const computadas = [
        mkJanela(1, '2026-07-09T08:30:00.000Z', '2026-07-09T12:30:00.000Z'),
        mkJanela(2, '2026-07-09T13:00:00.000Z', '2026-07-09T18:00:00.000Z'),
        mkJanela(3, '2026-07-09T19:00:00.000Z', '2026-07-09T22:00:00.000Z'),
    ];
    const { acoes, stats } = planReconciliacao(existentes, computadas);
    assert(stats.colisoesProtegidas === 1, 'MANUAL no índice 1 gera colisão');
    assert(stats.atualizadas === 1, 'PENDENTE no índice 2 é atualizado');
    assert(stats.criadas === 1, 'índice 3 é criado');
    assert(stats.removidas === 0, 'nenhuma linha livre removida');
    assert(acoes.some((a) => a.type === 'collision' && a.indice === 1), 'ação de colisão no índice 1');
}

{
    const existentes: RpdExistente[] = [
        { RPDCodigo: 10, RPDJanelaIndice: 1, RPDStatus: 'ENVIADO', RPDDataEntrada: new Date('2026-07-09T08:00:00.000Z'), RPDDataSaida: new Date('2026-07-09T12:00:00.000Z'), PERCodigo: null },
    ];
    const computadas = [mkJanela(1, '2026-07-09T08:00:00.000Z', '2026-07-09T12:00:00.000Z')];
    const { stats } = planReconciliacao(existentes, computadas);
    assert(stats.atualizadas === 0, 'ENVIADO com dados iguais não precisa update');
    assert(stats.removidas === 0, 'ENVIADO não é removido quando índice permanece');
}

{
    const existentes: RpdExistente[] = [
        { RPDCodigo: 20, RPDJanelaIndice: 1, RPDStatus: 'PENDENTE', RPDDataEntrada: new Date('2026-07-09T08:00:00.000Z'), RPDDataSaida: new Date('2026-07-09T12:00:00.000Z'), PERCodigo: null },
    ];
    const { stats } = planReconciliacao(existentes, []);
    assert(stats.removidas === 1, 'PENDENTE órfão é removido');
}

{
    const bounds = getInstitutionLocalDayBounds(new Date('2026-07-09T15:00:00.000Z'), -3);
    const diaUtc = {
        PESCodigo: 1,
        dataLocal: new Date('2026-07-09T12:00:00.000Z'),
        inicio: new Date('2026-07-09T00:00:00.000Z'),
        fim: new Date('2026-07-10T00:00:00.000Z'),
    };
    assert(diaOverlapsLocalToday(diaUtc, bounds), 'dia UTC sobrepõe dia local de hoje');
}

{
    const bounds = getInstitutionLocalDayBounds(new Date('2026-07-09T15:00:00.000Z'), -3);
    const janelas = [
        mkJanela(1, '2026-07-09T14:00:00.000Z', '2026-07-09T18:00:00.000Z'),
        { ...mkJanela(2, '2026-07-08T14:00:00.000Z', '2026-07-08T18:00:00.000Z'), PESCodigo: 200 },
    ];
    const coletadas = collectJanelasForLocalDay(janelas, 100, bounds);
    assert(coletadas.length === 1, 'coleta apenas janelas da pessoa no dia local');
    assert(coletadas[0].RPDJanelaIndice === 1, 'reindexa a partir de 1');
    assert(coletadas[0].dataLocal.getTime() === bounds.dataLocal.getTime(), 'dataLocal remapeada para dia local');
}

console.log('registro-diario-aggregation selftest OK');
