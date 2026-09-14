import { PERFIL_NOME_MAX_BYTES, prefixoDoTurno, sugerirNomePerfil, validarNomePerfil } from './perfil-nome';

describe('prefixoDoTurno', () => {
  it.each([
    ['matutino', 'MATUTINO'],
    ['Vespertino', 'VESPERTINO'],
    ['noturno', 'NOTURNO'],
    ['Semi-integral', 'SEMIINTEGRAL'],
    ['Manhã', 'MANHA'],
    ['', 'HORARIO'],
    [null, 'HORARIO'],
  ])('%p → %p', (turno, esperado) => {
    expect(prefixoDoTurno(turno)).toBe(esperado);
  });

  it('trunca em 12 para caber o sufixo -NN em 15 bytes', () => {
    expect(prefixoDoTurno('Integral estendido noite')).toBe('INTEGRALESTE');
  });
});

describe('sugerirNomePerfil', () => {
  it('numera a partir de 01 e pula os já usados (sem diferenciar maiúsculas)', () => {
    expect(sugerirNomePerfil('matutino', [])).toBe('MATUTINO-01');
    expect(sugerirNomePerfil('matutino', ['matutino-01', 'MATUTINO-02'])).toBe('MATUTINO-03');
  });

  it('todo nome sugerido cabe no limite', () => {
    for (const turno of ['vespertino', 'Semi-integral estendido', null]) {
      expect(Buffer.byteLength(sugerirNomePerfil(turno, []), 'utf8')).toBeLessThanOrEqual(PERFIL_NOME_MAX_BYTES);
    }
  });
});

describe('validarNomePerfil', () => {
  it('aceita até 15 bytes', () => {
    expect(validarNomePerfil('VESPERTINO-01', [])).toBeNull();
    expect(validarNomePerfil('ABCDEFGHIJKLMNO', [])).toBeNull();
  });

  it('rejeita acima de 15 bytes — acentos contam 2', () => {
    expect(validarNomePerfil('ABCDEFGHIJKLMNOP', [])).toMatch(/Máximo de 15/);
    expect(validarNomePerfil('MANHÃÃÃÃÃÃÃÃ', [])).toMatch(/Máximo de 15/); // 13 caracteres, 21 bytes
  });

  it('rejeita vazio e nomes reservados (grupos padrão / outros perfis)', () => {
    expect(validarNomePerfil('   ', [])).toMatch(/Informe/);
    expect(validarNomePerfil('student', ['Student', 'Professor'])).toMatch(/já está em uso/);
  });
});
