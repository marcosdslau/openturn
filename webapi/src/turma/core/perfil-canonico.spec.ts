import {
  canonizar,
  canonizarRegras,
  diaInteiro,
  ehDiaInteiro,
  hashConfig,
  hashJanelas,
  janelaParaLinha,
  linhaParaJanela,
  normalizarRegras,
  regrasDoPerfil,
  regrasParaLinhas,
  validarJanelas,
  validarRegras,
} from './perfil-canonico';
import type { JanelaEntrada, RegrasEntrada } from './tipos';

const SEG_SEX = [false, true, true, true, true, true, false];
const j = (inicio: string, fim: string, dias: boolean[]): JanelaEntrada => ({ inicio, fim, dias });
const hr = (...horarios: JanelaEntrada[]) => ({ modo: 'horario' as const, horarios });
const LIVRE = { modo: 'livre' as const };
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

  it('ehDiaInteiro reconhece 24 h em todos os dias', () => {
    expect(ehDiaInteiro(diaInteiro())).toBe(true);
    expect(ehDiaInteiro(canonizar([j('00:00', '23:00', [true, true, true, true, true, true, true])]))).toBe(false);
    expect(ehDiaInteiro(canonizar([j('00:00', '12:00', [true, true, true, true, true, true, true]), j('12:00', '00:00', [true, true, true, true, true, true, true])]))).toBe(true);
  });
});

describe('regras por sentido', () => {
  const base: RegrasEntrada = { interna: LIVRE, externa: hr(j('17:00', '18:00', SEG_SEX)) };

  it('perfis só coincidem quando entrada E saída coincidem', () => {
    const h = hashJanelas(canonizarRegras(base));
    // mesma saída digitada de outro jeito → mesmo perfil
    expect(
      hashJanelas(canonizarRegras({ interna: LIVRE, externa: hr(j('17:00', '17:30', SEG_SEX), j('17:30', '18:00', SEG_SEX)) })),
    ).toBe(h);
    // mesmas faixas, sentidos trocados → outro perfil
    expect(hashJanelas(canonizarRegras({ interna: hr(j('17:00', '18:00', SEG_SEX)), externa: LIVRE }))).not.toBe(h);
    // entrada bloqueada em vez de livre → outro perfil
    expect(hashJanelas(canonizarRegras({ interna: BLOQ, externa: base.externa }))).not.toBe(h);
  });

  it('livre e bloqueado ignoram faixas enviadas por engano', () => {
    const comLixo = { interna: { modo: 'livre' as const, horarios: [j('07:00', '08:00', SEG_SEX)] }, externa: base.externa };
    expect(hashJanelas(canonizarRegras(comLixo))).toBe(hashJanelas(canonizarRegras(base)));
    expect(canonizarRegras(comLixo).interna).toEqual({ modo: 'livre', dias: null });
  });

  it('hashConfig muda com o nome', () => {
    const c = canonizarRegras(base);
    expect(hashConfig('MATUTINO-01', c)).not.toBe(hashConfig('MATUTINO-02', c));
  });

  it('validarRegras identifica o sentido em cada erro e recusa os dois bloqueados', () => {
    expect(validarRegras(base)).toEqual([]);
    expect(validarRegras({ interna: hr(), externa: LIVRE })[0]).toMatch(/^Entrada na Área Interna: Informe ao menos uma faixa/);
    expect(validarRegras({ interna: LIVRE, externa: hr(j('7:00', '8:00', SEG_SEX)) })[0]).toMatch(/^Entrada na Área Externa: .*HH:mm/);
    expect(validarRegras({ interna: BLOQ, externa: BLOQ })).toEqual([
      'Os dois sentidos estão bloqueados: nenhuma pessoa da turma passaria na catraca',
    ]);
    expect(validarRegras({ interna: { modo: 'x' as never }, externa: LIVRE })[0]).toMatch(/informe o modo/);
    expect(validarRegras(null)).toHaveLength(1);
  });

  it('normalizarRegras aceita o formato anterior (mesmas faixas nos dois sentidos)', () => {
    const faixas = [j('07:00', '12:00', SEG_SEX)];
    expect(normalizarRegras({ horarios: faixas })).toEqual({ interna: hr(...faixas), externa: hr(...faixas) });
    expect(normalizarRegras({ regras: base, horarios: faixas })).toBe(base);
    expect(normalizarRegras({})).toBeNull();
  });

  it('regrasParaLinhas → regrasDoPerfil devolve as mesmas regras', () => {
    const regras: RegrasEntrada = {
      interna: hr(j('06:30', '07:30', SEG_SEX), j('12:50', '13:10', SEG_SEX)),
      externa: hr(j('12:00', '12:30', SEG_SEX)),
    };
    const linhas = regrasParaLinhas(regras).map((l) => ({ ...l, PHJCodigo: 0 }));
    expect(linhas.map((l) => l.PHJSentido)).toEqual(['INTERNA', 'INTERNA', 'EXTERNA']);
    expect(regrasDoPerfil({ PHAModoInterna: 'HORARIO', PHAModoExterna: 'HORARIO', janelas: linhas })).toEqual(regras);
    expect(regrasDoPerfil({ PHAModoInterna: 'LIVRE', PHAModoExterna: 'BLOQUEADO', janelas: [] })).toEqual({
      interna: { modo: 'livre' },
      externa: { modo: 'bloqueado' },
    });
  });

  it('janelaParaLinha / linhaParaJanela preservam a faixa', () => {
    const faixa = j('06:30', '12:30', SEG_SEX);
    expect(linhaParaJanela(janelaParaLinha(faixa, 1, 'externa'))).toEqual(faixa);
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
    expect(validarJanelas(muitas)).toContain('Máximo de 10 faixas por turma');
  });
});
