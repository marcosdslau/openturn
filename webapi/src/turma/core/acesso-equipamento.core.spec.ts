import { paraSpans } from './acesso-equipamento.core';

const SEG_SEX = [false, true, true, true, true, true, false];
const SO_SAB = [false, false, false, false, false, false, true];

describe('paraSpans', () => {
  it('converte uma faixa comum em um único intervalo em segundos', () => {
    expect(paraSpans([{ inicio: '06:30', fim: '07:30', dias: SEG_SEX }])).toEqual([
      { start: 23400, end: 27000, dias: SEG_SEX, feriados: undefined },
    ]);
  });

  it('trata 24:00 como fim do dia (86399, não 86400)', () => {
    const [span] = paraSpans([{ inicio: '00:00', fim: '24:00', dias: SEG_SEX }]);
    expect(span).toMatchObject({ start: 0, end: 86399 });
  });

  it('parte a faixa que cruza a meia-noite e empurra a sobra para o dia seguinte', () => {
    // Sábado 22:00 → 02:00 vale até o fim de sábado e retoma no domingo.
    const spans = paraSpans([{ inicio: '22:00', fim: '02:00', dias: SO_SAB }]);

    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ start: 79200, end: 86399, dias: SO_SAB });
    expect(spans[1]).toMatchObject({
      start: 0,
      end: 7200,
      dias: [true, false, false, false, false, false, false],
    });
  });

  it('não cria o segundo intervalo quando a faixa termina exatamente na meia-noite', () => {
    const spans = paraSpans([{ inicio: '18:00', fim: '00:00', dias: SEG_SEX }]);

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ start: 64800, end: 86399 });
  });

  it('preserva os feriados em cada parte da faixa partida', () => {
    const feriados = [true, false, true];
    const spans = paraSpans([{ inicio: '23:00', fim: '01:00', dias: SO_SAB, feriados }]);

    expect(spans).toHaveLength(2);
    expect(spans.every((s) => JSON.stringify(s.feriados) === JSON.stringify(feriados))).toBe(true);
  });
});
