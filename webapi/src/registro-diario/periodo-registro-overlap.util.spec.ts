import { BadRequestException } from '@nestjs/common';
import {
  hhmmToMinutes,
  nominalRange,
  effectiveRange,
  rangesOverlap,
  assertNoOverlap,
  PeriodoInterval,
} from './periodo-registro-overlap.util';

describe('hhmmToMinutes', () => {
  it('converte "00:00" para 0', () => expect(hhmmToMinutes('00:00')).toBe(0));
  it('converte "08:00" para 480', () => expect(hhmmToMinutes('08:00')).toBe(480));
  it('converte "12:01" para 721', () => expect(hhmmToMinutes('12:01')).toBe(721));
  it('converte "23:59" para 1439', () => expect(hhmmToMinutes('23:59')).toBe(1439));
});

describe('nominalRange', () => {
  it('retorna horários nominais sem tolerâncias', () => {
    const p: PeriodoInterval = {
      PERHorarioInicio: '08:00',
      PERHorarioFim: '12:00',
      PERToleranciaEntradaMinutos: 60,
      PERToleranciaSaidaMinutos: 60,
    };
    const { start, end } = nominalRange(p);
    expect(start).toBe(480);
    expect(end).toBe(720);
  });
});

describe('effectiveRange', () => {
  it('expande início e fim pelas tolerâncias', () => {
    const p: PeriodoInterval = {
      PERHorarioInicio: '08:00',
      PERHorarioFim: '12:00',
      PERToleranciaEntradaMinutos: 30,
      PERToleranciaSaidaMinutos: 60,
    };
    const { start, end } = effectiveRange(p);
    expect(start).toBe(480 - 30); // 450
    expect(end).toBe(720 + 60);   // 780
  });

  it('sem tolerâncias retorna horários nominais', () => {
    const p: PeriodoInterval = {
      PERHorarioInicio: '13:00',
      PERHorarioFim: '18:00',
      PERToleranciaEntradaMinutos: 0,
      PERToleranciaSaidaMinutos: 0,
    };
    const { start, end } = effectiveRange(p);
    expect(start).toBe(780);
    expect(end).toBe(1080);
  });
});

describe('rangesOverlap', () => {
  it('ranges claramente separados não sobrepõem', () => {
    expect(rangesOverlap({ start: 0, end: 100 }, { start: 200, end: 300 })).toBe(false);
  });

  it('ranges que se intersectam sobrepõem', () => {
    expect(rangesOverlap({ start: 0, end: 200 }, { start: 100, end: 300 })).toBe(true);
  });

  it('borda tocando conta como overlap (start === end)', () => {
    expect(rangesOverlap({ start: 0, end: 100 }, { start: 100, end: 200 })).toBe(true);
  });

  it('um range dentro do outro sobrepõe', () => {
    expect(rangesOverlap({ start: 0, end: 300 }, { start: 100, end: 200 })).toBe(true);
  });
});

describe('assertNoOverlap', () => {
  const manha: PeriodoInterval = {
    PERCodigo: 1,
    PERNome: 'Manhã',
    PERHorarioInicio: '08:00',
    PERHorarioFim: '12:00',
    PERToleranciaEntradaMinutos: 0,
    PERToleranciaSaidaMinutos: 0,
  };

  it('Manhã 08:00–12:20 + Tarde 12:00–18:00 → overlap (sobreposição real)', () => {
    const manha1220: PeriodoInterval = { ...manha, PERHorarioFim: '12:20' };
    const tarde: PeriodoInterval = {
      PERNome: 'Tarde',
      PERHorarioInicio: '12:00',
      PERHorarioFim: '18:00',
      PERToleranciaEntradaMinutos: 0,
      PERToleranciaSaidaMinutos: 0,
    };
    expect(() => assertNoOverlap(tarde, [manha1220])).toThrow(BadRequestException);
  });

  it('Manhã 08:00–12:00 + Tarde 12:00–18:00 → overlap (borda tocando)', () => {
    const tarde: PeriodoInterval = {
      PERNome: 'Tarde',
      PERHorarioInicio: '12:00',
      PERHorarioFim: '18:00',
      PERToleranciaEntradaMinutos: 0,
      PERToleranciaSaidaMinutos: 0,
    };
    expect(() => assertNoOverlap(tarde, [manha])).toThrow(BadRequestException);
  });

  it('Manhã 08:00–12:00 + Tarde 12:01–18:00 → OK', () => {
    const tarde: PeriodoInterval = {
      PERNome: 'Tarde',
      PERHorarioInicio: '12:01',
      PERHorarioFim: '18:00',
      PERToleranciaEntradaMinutos: 0,
      PERToleranciaSaidaMinutos: 0,
    };
    expect(() => assertNoOverlap(tarde, [manha])).not.toThrow();
  });

  it('update sem alterar horários (excludeId = self) → OK', () => {
    const updated: PeriodoInterval = {
      PERCodigo: 1,
      PERNome: 'Manhã Renomeada',
      PERHorarioInicio: '08:00',
      PERHorarioFim: '12:00',
      PERToleranciaEntradaMinutos: 0,
      PERToleranciaSaidaMinutos: 0,
    };
    expect(() => assertNoOverlap(updated, [manha], 1)).not.toThrow();
  });

  it('tolerância de saída não afeta overlap — horários nominais separados → OK', () => {
    const manha60: PeriodoInterval = {
      ...manha,
      PERToleranciaSaidaMinutos: 60, // fim efetivo = 13:00, mas nominal = 12:00
    };
    const tarde: PeriodoInterval = {
      PERNome: 'Tarde',
      PERHorarioInicio: '12:30',
      PERHorarioFim: '18:00',
      PERToleranciaEntradaMinutos: 0,
      PERToleranciaSaidaMinutos: 0,
    };
    expect(() => assertNoOverlap(tarde, [manha60])).not.toThrow();
  });

  it('tolerância de entrada não afeta overlap — horários nominais separados → OK', () => {
    const manha: PeriodoInterval = {
      PERCodigo: 1,
      PERNome: 'Manhã',
      PERHorarioInicio: '08:00',
      PERHorarioFim: '12:00',
      PERToleranciaEntradaMinutos: 0,
      PERToleranciaSaidaMinutos: 0,
    };
    const tarde: PeriodoInterval = {
      PERNome: 'Tarde',
      PERHorarioInicio: '12:01',
      PERHorarioFim: '18:00',
      PERToleranciaEntradaMinutos: 60, // início efetivo = 11:01, mas nominal = 12:01
      PERToleranciaSaidaMinutos: 0,
    };
    expect(() => assertNoOverlap(tarde, [manha])).not.toThrow();
  });

  it('erro contém code PERIODO_OVERLAP', () => {
    const tarde: PeriodoInterval = {
      PERNome: 'Tarde',
      PERHorarioInicio: '12:00',
      PERHorarioFim: '18:00',
      PERToleranciaEntradaMinutos: 0,
      PERToleranciaSaidaMinutos: 0,
    };
    try {
      assertNoOverlap(tarde, [manha]);
      fail('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const body = (e as BadRequestException).getResponse() as any;
      expect(body.code).toBe('PERIODO_OVERLAP');
    }
  });

  it('lista vazia → sem erro', () => {
    expect(() => assertNoOverlap(manha, [])).not.toThrow();
  });
});
