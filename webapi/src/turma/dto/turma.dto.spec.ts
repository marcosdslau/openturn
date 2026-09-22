import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { TurmaValidacaoDto } from './turma.dto';

// Mesma configuração do main.ts.
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const validar = async <T>(tipo: new () => T, corpo: unknown): Promise<T> =>
  pipe.transform(corpo, { type: 'body', metatype: tipo } as ArgumentMetadata);
const mensagens = async (tipo: new () => unknown, corpo: unknown): Promise<string[]> => {
  try {
    await validar(tipo, corpo);
    return [];
  } catch (err) {
    const resposta = (err as BadRequestException).getResponse() as { message: string[] };
    return resposta.message;
  }
};

const SEG_SEX = [false, true, true, true, true, true, false];

describe('DTOs de turma — a turma só escolhe departamento e escopo', () => {
  it('aceita DEPCodigo e escopo, e descarta o que não faz parte do contrato', async () => {
    const dto = await validar(TurmaValidacaoDto, {
      ativa: true,
      DEPCodigo: 101,
      escopo: { todos: false, EQPCodigos: [1, 2] },
      horarios: [{ inicio: '07:00', fim: '12:00', dias: SEG_SEX }],
    });
    expect(dto).toMatchObject({ ativa: true, DEPCodigo: 101, escopo: { todos: false, EQPCodigos: [1, 2] } });
    expect((dto as unknown as Record<string, unknown>).horarios).toBeUndefined();
  });

  it('exige departamento quando ativa, e dispensa quando inativa', async () => {
    expect(await mensagens(TurmaValidacaoDto, { ativa: true, escopo: { todos: true } })).toEqual([
      'Informe o departamento da turma',
    ]);
    expect(await mensagens(TurmaValidacaoDto, { ativa: false, escopo: { todos: true } })).toEqual([]);
  });

  it('escopo restrito exige ao menos um equipamento', async () => {
    const erros = await mensagens(TurmaValidacaoDto, {
      ativa: true,
      DEPCodigo: 101,
      escopo: { todos: false, EQPCodigos: [] },
    });
    expect(erros.join(' | ')).toMatch(/ao menos um equipamento/);
  });
});
