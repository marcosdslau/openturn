import {
  diferencaSimetrica,
  elegerTurma,
  grupoNoEquipamento,
  noEscopo,
  resolverEscopo,
  resolverTurmaDaMatricula,
  type TurmaEfetiva,
  type TurmaEstado,
} from './estado-desejado';

const turma = (over: Partial<TurmaEstado> = {}): TurmaEstado => ({
  TRMCodigo: 1,
  DEPCodigo: 7,
  TRMValidacaoAtiva: true,
  TRMAtiva: true,
  TRMTodosEquipamentos: false,
  escopo: [],
  ...over,
});

/** Turma no modelo novo: aponta para um departamento adotado em alguns equipamentos. */
const comDepartamento = (adotado: Array<[number, string]>, over: Partial<TurmaEstado> = {}): TurmaEfetiva => ({
  ...turma({ escopo: [1, 2, 3], ...over }),
  departamentoPorEquipamento: new Map(adotado),
});

describe('escopo e estado desejado (§7)', () => {
  it('"todos" vale para qualquer equipamento, inclusive futuros', () => {
    expect(noEscopo(turma({ TRMTodosEquipamentos: true }), 999)).toBe(true);
    expect(noEscopo(turma({ escopo: [1, 2] }), 3)).toBe(false);
  });

  it('resolverEscopo restringe aos ativos', () => {
    expect(resolverEscopo(turma({ TRMTodosEquipamentos: true }), [1, 2, 3])).toEqual([1, 2, 3]);
    expect(resolverEscopo(turma({ escopo: [2, 9] }), [1, 2, 3])).toEqual([2]);
  });

  it('diferencaSimetrica devolve quem entrou e quem saiu', () => {
    expect(diferencaSimetrica([1, 2, 3], [2, 3, 4])).toEqual([1, 4]);
    expect(diferencaSimetrica([1, 2], [2, 1])).toEqual([]);
  });
});

describe('grupoNoEquipamento — caminho novo (departamento adotado)', () => {
  const pessoa = { PESGrupo: 'Student' };

  it('usa o nome do departamento ADOTADO naquele equipamento', () => {
    const t = comDepartamento([
      [1, 'CATEC MANHA'],
      [2, 'Catec manhã'],
    ]);
    // Cada catraca pode ter o grupo com nome próprio — o vínculo é por id, não por nome.
    expect(grupoNoEquipamento(pessoa, t, 1)).toBe('CATEC MANHA');
    expect(grupoNoEquipamento(pessoa, t, 2)).toBe('Catec manhã');
  });

  it('equipamento no escopo mas sem adoção: grupo padrão, porque não existe grupo para a pessoa lá', () => {
    expect(grupoNoEquipamento(pessoa, comDepartamento([[1, 'CATEC']]), 3)).toBe('Student');
  });

  it('fora do escopo volta ao grupo padrão mesmo com adoção', () => {
    const t = comDepartamento([[9, 'CATEC']], { escopo: [1] });
    expect(grupoNoEquipamento(pessoa, t, 9)).toBe('Student');
  });

  it('turma sem departamento não é vigente: grupo padrão', () => {
    const t: TurmaEfetiva = { ...comDepartamento([[1, 'CATEC']]), DEPCodigo: null };
    expect(grupoNoEquipamento(pessoa, t, 1)).toBe('Student');
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
