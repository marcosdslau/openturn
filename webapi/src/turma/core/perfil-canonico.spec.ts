import { canonizar, minutos, ordenarEFundir, validarJanelas } from './perfil-canonico';
import type { JanelaEntrada } from './tipos';

const SEG_SEX = [false, true, true, true, true, true, false];
const j = (inicio: string, fim: string, dias: boolean[]): JanelaEntrada => ({ inicio, fim, dias });
const BLOQ = { modo: 'bloqueado' as const };

describe('canonizar (faixas de um sentido)', () => {
  it('equivale configurações digitadas de formas diferentes que liberam os mesmos minutos (§6.1)', () => {
    const a = canonizar([j('06:30', '12:30', SEG_SEX)]);
    const b = canonizar([
      j('06:30', '12:30', [false, true, true, true, false, false, false]),
      j('06:30', '12:30', [false, false, false, false, true, true, false]),
    ]);
    const c = canonizar([j('06:30', '09:00', SEG_SEX), j('09:00', '12:30', SEG_SEX)]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('divide a faixa que cruza a meia-noite no dia seguinte (sábado → domingo)', () => {
    const c = canonizar([j('22:00', '02:00', [false, false, false, false, false, false, true])]);
    expect(c[6]).toEqual([[1320, 1440]]);
    expect(c[0]).toEqual([[0, 120]]);
  });

  it('faixa até 00:00 não gera intervalo vazio no dia seguinte', () => {
    const c = canonizar([j('18:00', '00:00', [false, true, false, false, false, false, false])]);
    expect(c[1]).toEqual([[1080, 1440]]);
    expect(c[2]).toEqual([]);
  });

});


describe('validarJanelas', () => {
  it('rejeita sobreposição no mesmo dia e aceita adjacência', () => {
    expect(validarJanelas([j('07:00', '12:00', SEG_SEX), j('11:00', '13:00', SEG_SEX)])[0]).toMatch(/se sobrepõem em Seg/);
    expect(validarJanelas([j('07:00', '09:00', SEG_SEX), j('09:00', '12:00', SEG_SEX)])).toEqual([]);
  });

  it('detecta sobreposição no transbordo da meia-noite (§6.1)', () => {
    const erros = validarJanelas([
      j('18:00', '00:30', [false, true, false, false, false, false, false]),
      j('00:00', '06:00', [false, false, true, false, false, false, false]),
    ]);
    expect(erros[0]).toMatch(/se sobrepõem em Ter/);
  });

  it('exige dia marcado, formato HH:mm e início diferente do fim; limita a 10 faixas', () => {
    expect(validarJanelas([j('07:00', '12:00', [false, false, false, false, false, false, false])])[0]).toMatch(/ao menos um dia/);
    expect(validarJanelas([j('24:00', '12:00', SEG_SEX)])[0]).toMatch(/HH:mm/);
    expect(validarJanelas([j('07:00', '07:00', SEG_SEX)])[0]).toMatch(/não podem ser iguais/);
    const muitas = Array.from({ length: 11 }, (_, i) => j(`${String(i).padStart(2, '0')}:00`, `${String(i).padStart(2, '0')}:30`, SEG_SEX));
    expect(validarJanelas(muitas)).toContain('Máximo de 10 faixas por horário');
  });
});
