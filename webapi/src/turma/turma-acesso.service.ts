import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';
import { resizeBase64Image } from '../common/utils/image.utils';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';
import { redisTurmaSyncLockKey } from '../common/redis/redis-keys';
import { HardwareService } from '../hardware/hardware.service';
import {
  criarAccessGroupPort,
  criarLockRedis,
  TurmaAcessoCore,
  TurmaAcessoErro,
  type LockPort,
} from './core';

/**
 * Adaptador Nest do núcleo: injeta as portas da webapi (hardware + Redis) e traduz
 * TurmaAcessoErro para exceções HTTP. Também usado pela engine de rotinas da webapi.
 */
@Injectable()
export class TurmaAcessoService implements OnModuleDestroy {
  private readonly logger = new Logger(TurmaAcessoService.name);
  private redis: Redis | null = null;
  private lockPort: LockPort | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hardwareService: HardwareService,
  ) {}

  core(instituicaoCodigo: number): TurmaAcessoCore {
    return new TurmaAcessoCore(this.prisma, instituicaoCodigo, {
      hardware: criarAccessGroupPort((eqp) => this.hardwareService.instantiate(eqp)),
      lock: this.lock(),
      chaveLock: redisTurmaSyncLockKey,
      log: (nivel, mensagem) => {
        if (nivel === 'error') this.logger.error(mensagem);
        else if (nivel === 'warn') this.logger.warn(mensagem);
        else this.logger.log(mensagem);
      },
    });
  }

  /** Executa uma operação do núcleo convertendo erros de regra em 400/404/409. */
  async executar<T>(instituicaoCodigo: number, fn: (core: TurmaAcessoCore) => Promise<T>): Promise<T> {
    try {
      return await fn(this.core(instituicaoCodigo));
    } catch (err) {
      if (err instanceof TurmaAcessoErro) {
        const corpo = { message: err.message, detalhes: err.detalhes ?? null };
        if (err.codigo === 'nao_encontrado') throw new NotFoundException(corpo);
        if (err.codigo === 'conflito') throw new ConflictException(corpo);
        if (err.codigo === 'equipamento') throw new BadGatewayException(corpo);
        throw new BadRequestException(corpo);
      }
      throw err;
    }
  }

  /** Pessoas da turma com a foto reduzida para miniatura (mesmo tamanho da listagem de pessoas). */
  async listarPessoasComMiniatura(
    instituicaoCodigo: number,
    trmCodigo: number,
    filtro: { busca?: string; page?: number; limit?: number },
  ) {
    const r = await this.executar(instituicaoCodigo, (core) => core.listarPessoas(trmCodigo, { ...filtro, comFoto: true }));
    const data = await Promise.all(
      r.data.map(async ({ PESFotoBase64, ...p }) => ({
        ...p,
        PESFotoBase64: PESFotoBase64 ? await resizeBase64Image(PESFotoBase64, 72, 72) : null,
      })),
    );
    return { ...r, data };
  }

  private lock(): LockPort {
    if (!this.lockPort) {
      this.redis = new Redis({ ...getRedisConnectionOptions(), lazyConnect: true, maxRetriesPerRequest: 2 });
      this.redis.on('error', (err) => this.logger.warn(`Redis (lock de turmas): ${err?.message ?? err}`));
      this.lockPort = criarLockRedis(this.redis);
    }
    return this.lockPort;
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
