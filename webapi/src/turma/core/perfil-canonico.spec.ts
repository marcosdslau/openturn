import { canonizar, hashConfig, hashJanelas, janelaParaLinha, linhaParaJanela, validarJanelas } from './perfil-canonico';
import type { JanelaEntrada } from './tipos';

const SEG_SEX = [false, true, true, true, true, true, false];
const j = (inicio: string, fim: string, dias: boolean[]): JanelaEntrada => ({ inicio, fim, dias });

describe('canonizar / hashJanelas', () => {
  it('agrupa configurações digitadas de formas diferentes que liberam os mesmos minutos (§6.1)', () => {
    const a = [j('06:30', '12:30', SEG_SEX)];
    const b = [
      j('06:30', '12:30', [false, true, true, true, false, false, false]),
      j('06:30', '12:30', [false, false, false, false, true, true, false]),
    ];
    const c = [j('06:30', '09:00', SEG_SEX), j('09:00', '12:30', SEG_SEX)];

    const h = hashJanelas(canonizar(a));
    expect(hashJanelas(canonizar(b))).toBe(h);
    expect(hashJanelas(canonizar(c))).toBe(h);
  });

  it('diferencia horários que não são equivalentes', () => {
    expect(hashJanelas(canonizar([j('06:30', '12:30', SEG_SEX)]))).not.toBe(
      hashJanelas(canonizar([j('06:30', '12:31', SEG_SEX)])),
    );
  });

  it('independe da ordem das faixas', () => {
    const x = [j('13:00', '17:00', SEG_SEX), j('07:00', '11:00', SEG_SEX)];
    expect(hashJanelas(canonizar(x))).toBe(hashJanelas(canonizar([...x].reverse())));
  });

  it('divide a faixa que cruza a meia-noite no dia seguinte', () => {
    const c = canonizar([j('18:00', '00:30', [false, true, false, false, false, false, false])]);
    expect(c[1]).toEqual([[1080, 1440]]);
    expect(c[2]).toEqual([[0, 30]]);
  });

  it('sábado que cruza a meia-noite transborda para domingo', () => {
    const c = canonizar([j('22:00', '02:00', [false, false, false, false, false, false, true])]);
    expect(c[6]).toEqual([[1320, 1440]]);
    expect(c[0]).toEqual([[0, 120]]);
  });

  it('faixa terminando exatamente à meia-noite não gera intervalo vazio no dia seguinte', () => {
    const c = canonizar([j('18:00', '00:00', [false, true, false, false, false, false, false])]);
    expect(c[1]).toEqual([[1080, 1440]]);
    expect(c[2]).toEqual([]);
  });

  it('hashConfig muda com o nome, hashJanelas não', () => {
    const c = canonizar([j('07:00', '12:00', SEG_SEX)]);
    expect(hashConfig('MATUTINO-01', c)).not.toBe(hashConfig('MATUTINO-02', c));
  });
});

describe('validarJanelas', () => {
  it('aceita horário válido', () => {
    expect(validarJanelas([j('07:00', '12:00', SEG_SEX)])).toEqual([]);
  });

  it('exige ao menos uma faixa e um dia', () => {
    expect(validarJanelas([])).toContain('Informe ao menos uma faixa de horário');
    expect(validarJanelas([j('07:00', '12:00', [false, false, false, false, false, false, false])])[0]).toMatch(/ao menos um dia/);
  });

  it('rejeita formato inválido e início igual ao fim', () => {
    expect(validarJanelas([j('7:00', '12:00', SEG_SEX)])[0]).toMatch(/HH:mm/);
    expect(validarJanelas([j('24:00', '12:00', SEG_SEX)])[0]).toMatch(/HH:mm/);
    expect(validarJanelas([j('07:00', '07:00', SEG_SEX)])[0]).toMatch(/não podem ser iguais/);
  });

  it('rejeita sobreposição no mesmo dia', () => {
    const erros = validarJanelas([j('07:00', '12:00', SEG_SEX), j('11:00', '13:00', [false, false, false, true, false, false, false])]);
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatch(/Faixas 1 e 2 se sobrepõem em Qua/);
  });

  it('aceita faixas adjacentes', () => {
    expect(validarJanelas([j('07:00', '09:00', SEG_SEX), j('09:00', '12:00', SEG_SEX)])).toEqual([]);
  });

  it('detecta sobreposição no transbordo da meia-noite (§6.1)', () => {
    const erros = validarJanelas([
      j('18:00', '00:30', [false, true, false, false, false, false, false]),
      j('00:00', '06:00', [false, false, true, false, false, false, false]),
    ]);
    expect(erros[0]).toMatch(/se sobrepõem em Ter/);
  });

  it('mesma faixa noturna em dias consecutivos não conflita consigo mesma', () => {
    expect(validarJanelas([j('18:00', '06:00', [true, true, true, true, true, true, true])])).toEqual([]);
  });

  it('limita o número de faixas', () => {
    const muitas = Array.from({ length: 11 }, (_, i) => j(`${String(i).padStart(2, '0')}:00`, `${String(i).padStart(2, '0')}:30`, SEG_SEX));
    expect(validarJanelas(muitas)).toContain('Máximo de 10 faixas por turma');
  });
});

describe('janelaParaLinha / linhaParaJanela', () => {
  it('ida e volta preserva a faixa', () => {
    const faixa = j('06:30', '12:30', SEG_SEX);
    expect(linhaParaJanela(janelaParaLinha(faixa, 1))).toEqual(faixa);
  });
});
