import { canonizarRegras } from './perfil-canonico';
import { compararRegras, regrasAplicadas } from './inspecao';
import type { HardwareAccessGroupInspection } from './ports';

const SEG_SEX = [0, 1, 1, 1, 1, 1, 0];
const PORTAIS = { interna: '11', externa: '12' };

function inspecao(regras: HardwareAccessGroupInspection['regras']): HardwareAccessGroupInspection {
  return { encontrado: true, grupo: { id: '5', nome: 'MATUTINO-01' }, membros: 3, areas: [], portais: [], regras };
}

const regra = (id: string, portais: string[], spans: Array<{ start: number; end: number; dias: number[] }>, tipo = 1) => ({
  id,
  nome: `regra ${id}`,
  tipo,
  portais,
  horarios: spans.length ? [{ id: `tz${id}`, nome: `tz${id}`, spans: spans.map((s) => ({ ...s, feriados: [0, 0, 0] })) }] : [],
});

describe('regrasAplicadas', () => {
  it('reconstrói livre (24 h) e horário por portal', () => {
    const r = regrasAplicadas(
      inspecao([
        regra('1', ['11'], [{ start: 0, end: 86399, dias: [1, 1, 1, 1, 1, 1, 1] }]),
        regra('2', ['12'], [{ start: 61200, end: 64800, dias: SEG_SEX }]),
      ]),
      PORTAIS,
    );
    expect(r.interna).toMatchObject({ modo: 'livre', dias: null, bloqueios: 0 });
    expect(r.externa.modo).toBe('horario');
    expect(r.externa.dias![1]).toEqual([[1020, 1080]]);
    expect(r.externa.dias![0]).toEqual([]);
  });

  it('sem regra de permissão no portal = bloqueado; regra ligada aos dois portais conta nos dois', () => {
    const soSaida = regrasAplicadas(inspecao([regra('2', ['12'], [{ start: 0, end: 3600, dias: SEG_SEX }])]), PORTAIS);
    expect(soSaida.interna.modo).toBe('bloqueado');

    const ambos = regrasAplicadas(inspecao([regra('9', ['11', '12'], [{ start: 25200, end: 43200, dias: SEG_SEX }])]), PORTAIS);
    expect(ambos.interna.dias).toEqual(ambos.externa.dias);
  });

  it('une horários de várias regras do mesmo portal e sinaliza regra de bloqueio', () => {
    const r = regrasAplicadas(
      inspecao([
        regra('1', ['11'], [{ start: 25200, end: 30600, dias: SEG_SEX }]),
        regra('2', ['11'], [{ start: 30600, end: 36000, dias: SEG_SEX }]),
        regra('3', ['11'], [{ start: 0, end: 60, dias: SEG_SEX }], 0),
      ]),
      PORTAIS,
    );
    expect(r.interna.dias![1]).toEqual([[420, 600]]);
    expect(r.interna.bloqueios).toBe(1);
  });

  it('regra sem horário é tratada como livre (spec §8.3) e marcada', () => {
    const r = regrasAplicadas(inspecao([regra('1', ['11'], [])]), PORTAIS);
    expect(r.interna.modo).toBe('livre');
    expect(r.interna.regras[0].semHorario).toBe(true);
  });
});

describe('compararRegras', () => {
  const esperado = canonizarRegras({
    interna: { modo: 'livre' },
    externa: { modo: 'horario', horarios: [{ inicio: '17:00', fim: '18:00', dias: [false, true, true, true, true, true, false] }] },
  });

  it('em conformidade quando modo e minutos batem', () => {
    const aplicado = regrasAplicadas(
      inspecao([
        regra('1', ['11'], [{ start: 0, end: 86399, dias: [1, 1, 1, 1, 1, 1, 1] }]),
        regra('2', ['12'], [{ start: 61200, end: 64800, dias: SEG_SEX }]),
      ]),
      PORTAIS,
    );
    expect(compararRegras(esperado, aplicado)).toEqual([]);
  });

  it('descreve modo e horário divergentes por sentido (ex.: portais invertidos)', () => {
    const invertido = regrasAplicadas(
      inspecao([
        regra('1', ['12'], [{ start: 0, end: 86399, dias: [1, 1, 1, 1, 1, 1, 1] }]),
        regra('2', ['11'], [{ start: 61200, end: 64800, dias: SEG_SEX }]),
      ]),
      PORTAIS,
    );
    expect(compararRegras(esperado, invertido)).toEqual([
      'Entrada na Área Interna: configurado sempre liberado, no equipamento somente nos horários',
      'Entrada na Área Externa: configurado somente nos horários, no equipamento sempre liberado',
    ]);

    const outroHorario = regrasAplicadas(
      inspecao([
        regra('1', ['11'], [{ start: 0, end: 86399, dias: [1, 1, 1, 1, 1, 1, 1] }]),
        regra('2', ['12'], [{ start: 61200, end: 65700, dias: SEG_SEX }]),
      ]),
      PORTAIS,
    );
    expect(compararRegras(esperado, outroHorario)).toEqual([
      'Entrada na Área Externa: os horários gravados no equipamento são diferentes dos configurados',
    ]);
  });
});
