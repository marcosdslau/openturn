import { AcaoPassagem } from '@prisma/client';
import { buildPassagemDayGroups, type PassagemParaAgregacao } from './registro-diario-aggregation.helpers';

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(`aggregation selftest: ${msg}`);
}

const base = new Date('2025-06-10T12:00:00.000Z'); // meio-dia UTC
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

/** SAIDA mais cedo que a primeira ENTRADA não deve contaminar "entrada". */
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

/** Antes: INSFusoHorario -3 deslocava cedo UTC para o dia anterior; RPDData deve seguir calendário UTC do registro. */
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

console.log('registro-diario-aggregation selftest OK');
