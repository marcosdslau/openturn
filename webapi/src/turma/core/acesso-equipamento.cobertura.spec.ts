import { departamentosSemRegraNaArea } from './acesso-equipamento.core';

/** Espelho mínimo: só o que o cálculo usa. */
function contexto(adotados: Array<{ DEQCodigo: number; DEQNome: string; areasPorRegra: number[][] }>) {
  return {
    prisma: {
      dEQDepartamentoEquipamento: {
        findMany: async () =>
          adotados.map((d) => ({
            DEQCodigo: d.DEQCodigo,
            DEQNome: d.DEQNome,
            regras: d.areasPorRegra.map((areas) => ({ areas: areas.map((ARECodigo) => ({ ARECodigo })) })),
          })),
      },
    },
    ins: 1,
  } as never;
}

const eqp = { EQPCodigo: 100 } as never;

describe('departamentosSemRegraNaArea', () => {
  it('denuncia o departamento cujas regras não cobrem a área', async () => {
    const ctx = contexto([
      { DEQCodigo: 1, DEQNome: 'Catec manha', areasPorRegra: [[10], [11]] },
      { DEQCodigo: 2, DEQNome: 'Student', areasPorRegra: [[10]] },
    ]);

    // Área 11 (ex.: saída): só "Catec manha" libera. "Student" entraria e ficaria preso.
    expect(await departamentosSemRegraNaArea(ctx, eqp, 11)).toEqual([{ DEQCodigo: 2, nome: 'Student' }]);
  });

  it('não denuncia ninguém quando todos cobrem a área', async () => {
    const ctx = contexto([
      { DEQCodigo: 1, DEQNome: 'A', areasPorRegra: [[10, 11]] },
      { DEQCodigo: 2, DEQNome: 'B', areasPorRegra: [[11]] },
    ]);

    expect(await departamentosSemRegraNaArea(ctx, eqp, 11)).toEqual([]);
  });

  it('departamento sem regra nenhuma não passa em área nenhuma', async () => {
    const ctx = contexto([{ DEQCodigo: 3, DEQNome: 'Recém-adotado', areasPorRegra: [] }]);

    expect(await departamentosSemRegraNaArea(ctx, eqp, 99)).toEqual([{ DEQCodigo: 3, nome: 'Recém-adotado' }]);
  });

  it('uma área nova (portal recém-criado) deixa TODOS de fora', async () => {
    const ctx = contexto([
      { DEQCodigo: 1, DEQNome: 'Padrão', areasPorRegra: [[10]] },
      { DEQCodigo: 2, DEQNome: 'Professor', areasPorRegra: [[10]] },
    ]);

    expect((await departamentosSemRegraNaArea(ctx, eqp, 12)).map((d) => d.nome)).toEqual(['Padrão', 'Professor']);
  });
});
