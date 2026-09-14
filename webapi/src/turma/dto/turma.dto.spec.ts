import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { PerfilPreviewDto, SentidoEquipamentoDto, TurmaValidacaoDto } from './turma.dto';

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

describe('DTOs de turma — regras por sentido', () => {
  it('aceita regras por sentido e preserva as faixas aninhadas (whitelist)', async () => {
    const dto = await validar(TurmaValidacaoDto, {
      ativa: true,
      regras: {
        interna: { modo: 'livre' },
        externa: { modo: 'horario', horarios: [{ inicio: '17:00', fim: '18:00', dias: SEG_SEX, extra: 'x' }] },
      },
      escopo: { todos: false, EQPCodigos: [1, 2] },
      horarios: [{ inicio: '07:00', fim: '12:00', dias: SEG_SEX }],
    });
    expect(dto.regras).toEqual({
      interna: { modo: 'livre' },
      externa: { modo: 'horario', horarios: [{ inicio: '17:00', fim: '18:00', dias: SEG_SEX }] },
    });
    expect((dto as unknown as Record<string, unknown>).horarios).toBeUndefined();
  });

  it('exige regras com os dois sentidos quando ativa, e dispensa quando inativa', async () => {
    expect(await mensagens(TurmaValidacaoDto, { ativa: true, escopo: { todos: true } })).not.toEqual([]);
    expect(
      await mensagens(TurmaValidacaoDto, { ativa: true, regras: { interna: { modo: 'livre' } }, escopo: { todos: true } }),
    ).not.toEqual([]);
    expect(await mensagens(TurmaValidacaoDto, { ativa: false, escopo: { todos: true } })).toEqual([]);
  });

  it('recusa modo desconhecido e faixa fora do formato', async () => {
    const erros = await mensagens(TurmaValidacaoDto, {
      ativa: true,
      regras: { interna: { modo: 'sempre' }, externa: { modo: 'horario', horarios: [{ inicio: '7:00', fim: '18:00', dias: SEG_SEX }] } },
      escopo: { todos: true },
    });
    expect(erros.join(' | ')).toMatch(/modo/);
    expect(erros.join(' | ')).toMatch(/HH:mm/);
  });

  it('preview recebe regras; ajuste de sentido aceita só invertido/validado', async () => {
    expect(await mensagens(PerfilPreviewDto, { regras: { interna: { modo: 'livre' }, externa: { modo: 'bloqueado' } } })).toEqual([]);
    const s = await validar(SentidoEquipamentoDto, { invertido: true, outro: 1 });
    expect(s).toEqual({ invertido: true });
    expect(await mensagens(SentidoEquipamentoDto, { validado: 'sim' })).not.toEqual([]);
  });
});
