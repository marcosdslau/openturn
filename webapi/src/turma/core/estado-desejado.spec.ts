import {
  diferencaSimetrica,
  elegerTurma,
  grupoNoEquipamento,
  hashDesejado,
  noEscopo,
  perfilDeveExistir,
  resolverEscopo,
  resolverTurmaDaMatricula,
  type TurmaEstado,
} from './estado-desejado';

const turma = (over: Partial<TurmaEstado> = {}): TurmaEstado => ({
  TRMCodigo: 1,
  PHACodigo: 10,
  TRMValidacaoAtiva: true,
  TRMAtiva: true,
  TRMTodosEquipamentos: false,
  escopo: [],
  ...over,
});
const eqp = (EQPCodigo: number, EQPAtivo = true, sentidoPreparado = true) => ({ EQPCodigo, EQPAtivo, sentidoPreparado });

describe('escopo e estado desejado (§7)', () => {
  it('"todos" vale para qualquer equipamento, inclusive futuros', () => {
    expect(noEscopo(turma({ TRMTodosEquipamentos: true }), 999)).toBe(true);
    expect(noEscopo(turma({ escopo: [1, 2] }), 3)).toBe(false);
  });

  it('resolverEscopo restringe aos ativos', () => {
    expect(resolverEscopo(turma({ TRMTodosEquipamentos: true }), [1, 2, 3])).toEqual([1, 2, 3]);
    expect(resolverEscopo(turma({ escopo: [2, 9] }), [1, 2, 3])).toEqual([2]);
  });

  it('perfil compartilhado × escopos diferentes (tabela de §7.3)', () => {
    const turmaA = turma({ TRMCodigo: 1, escopo: [1, 2, 3] });
    const turmaB = turma({ TRMCodigo: 2, escopo: [3, 4] });
    const existe = (e: number) => perfilDeveExistir(10, eqp(e), [turmaA, turmaB]);
    expect([1, 2, 3, 4, 5, 6].map(existe)).toEqual([true, true, true, true, false, false]);

    // 3ª B tira o EQP 3: o perfil continua lá por causa da 3ª A
    const semTres = turma({ TRMCodigo: 2, escopo: [4] });
    expect(perfilDeveExistir(10, eqp(3), [turmaA, semTres])).toBe(true);
  });

  it('perfil não deve existir em equipamento inativo, sem áreas preparadas, turma inativa, desativada ou sem perfil', () => {
    expect(perfilDeveExistir(10, eqp(1, false), [turma({ TRMTodosEquipamentos: true })])).toBe(false);
    expect(perfilDeveExistir(10, eqp(1, true, false), [turma({ TRMTodosEquipamentos: true })])).toBe(false);
    expect(perfilDeveExistir(10, eqp(1), [turma({ TRMTodosEquipamentos: true, TRMAtiva: false })])).toBe(false);
    expect(perfilDeveExistir(10, eqp(1), [turma({ TRMTodosEquipamentos: true, TRMValidacaoAtiva: false })])).toBe(false);
    expect(perfilDeveExistir(10, eqp(1), [turma({ TRMTodosEquipamentos: true, PHACodigo: 11 })])).toBe(false);
  });

  it('hashDesejado é o hash do perfil ou null', () => {
    const perfil = { PHACodigo: 10, PHAHashConfig: 'abc' };
    expect(hashDesejado(perfil, eqp(1), [turma({ escopo: [1] })])).toBe('abc');
    expect(hashDesejado(perfil, eqp(2), [turma({ escopo: [1] })])).toBeNull();
  });

  it('diferencaSimetrica devolve quem entrou e quem saiu', () => {
    expect(diferencaSimetrica([1, 2, 3], [2, 3, 4])).toEqual([1, 4]);
    expect(diferencaSimetrica([1, 2], [2, 1])).toEqual([]);
  });
});

describe('grupoNoEquipamento (§7.2)', () => {
  const pessoa = { PESGrupo: 'Student' };
  const efetiva = { ...turma({ escopo: [1, 2, 3] }), perfilNome: 'MATUTINO-01' };

  it('perfil nos equipamentos do escopo, grupo padrão nos demais', () => {
    expect(grupoNoEquipamento(pessoa, efetiva, 1, true)).toBe('MATUTINO-01');
    expect(grupoNoEquipamento(pessoa, efetiva, 4, true)).toBe('Student');
  });

  it('equipamento no escopo mas sem áreas preparadas: grupo padrão (senão a pessoa ficaria pendente para sempre)', () => {
    expect(grupoNoEquipamento(pessoa, efetiva, 1, false)).toBe('Student');
  });

  it('sem turma, ou turma não vigente, volta ao grupo padrão', () => {
    expect(grupoNoEquipamento(pessoa, null, 1, true)).toBe('Student');
    expect(grupoNoEquipamento(pessoa, { ...efetiva, TRMValidacaoAtiva: false }, 1, true)).toBe('Student');
    expect(grupoNoEquipamento(pessoa, { ...efetiva, TRMAtiva: false }, 1, true)).toBe('Student');
  });
});

describe('elegerTurma', () => {
  it('maior prioridade, depois matrícula mais recente', () => {
    const antiga = { TRMCodigo: 1, TRMPrioridade: 0, matriculaCriadaEm: new Date('2026-01-01') };
    const recente = { TRMCodigo: 2, TRMPrioridade: 0, matriculaCriadaEm: new Date('2026-03-01') };
    const prioritaria = { TRMCodigo: 3, TRMPrioridade: 5, matriculaCriadaEm: new Date('2025-01-01') };
    expect(elegerTurma([antiga, recente])?.TRMCodigo).toBe(2);
    expect(elegerTurma([antiga, recente, prioritaria])?.TRMCodigo).toBe(3);
    expect(elegerTurma([])).toBeNull();
  });
});

describe('resolverTurmaDaMatricula (§12.2)', () => {
  const a = { TRMCodigo: 1, TRMTurma: '3º Ano A' };
  const b = { TRMCodigo: 2, TRMTurma: 'Reforço Matemática' };

  it('uma candidata vincula; nenhuma desvincula', () => {
    expect(resolverTurmaDaMatricula({ MATTurma: 'x', TRMCodigo: null }, [a])).toEqual({ TRMCodigo: 1, ambiguo: false });
    expect(resolverTurmaDaMatricula({ MATTurma: 'x', TRMCodigo: 1 }, [])).toEqual({ TRMCodigo: null, ambiguo: false });
  });

  it('várias: desempata pelo nome gravado na matrícula (ignorando acento e caixa)', () => {
    expect(resolverTurmaDaMatricula({ MATTurma: '3º ano a', TRMCodigo: null }, [a, b])).toEqual({ TRMCodigo: 1, ambiguo: false });
  });

  it('várias sem desempate: mantém o vínculo atual se ele for candidato; senão não vincula', () => {
    expect(resolverTurmaDaMatricula({ MATTurma: '?', TRMCodigo: 2 }, [a, b])).toEqual({ TRMCodigo: 2, ambiguo: true });
    expect(resolverTurmaDaMatricula({ MATTurma: '?', TRMCodigo: 9 }, [a, b])).toEqual({ TRMCodigo: null, ambiguo: true });
  });
});
