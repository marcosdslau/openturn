import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, StatusExecucao } from '@prisma/client';
import * as amqp from 'amqplib';
import type { Options } from 'amqplib';
import Redis from 'ioredis';
import {
  getJobsExchange,
  getRabbitUrl,
  getMainQueueName,
  getGlobalRetryQueue,
  getJobsDlxQueue,
} from '../../common/rabbit/rabbit-connection';
import {
  redisPendingKey,
  redisInflightZkey as redisInflightZkeyFn,
  redisSerialInflightZkey as redisSerialInflightZkeyFn,
  redisInflightPattern,
  redisInflightRegex,
  channelCancel,
} from '../../common/redis/redis-keys';

const ROTINA_RETRY_HEADER = 'x-rotina-retry-count';

export interface ReprocessDeadLetterResult {
  republished: number;
  skippedInvalid: number;
  errors: string[];
}
import { getRedisConnectionOptions } from '../../common/redis/redis-connection';
import { RotinaJobData } from './rotina-job.dto';

@Injectable()
export class RotinaQueueService {
  private readonly logger = new Logger(RotinaQueueService.name);
  private connectionPromise: Promise<amqp.ChannelModel> | null = null;
  private channelPromise: Promise<amqp.Channel> | null = null;
  private confirmChannelPromise: Promise<amqp.ConfirmChannel> | null = null;
  private redis: Redis | null = null;

  constructor(private readonly prisma: PrismaService) {
    try {
      const client = new Redis({
        ...getRedisConnectionOptions(),
        lazyConnect: true,
      });
      this.redis = client;
      client.connect().catch(() => {
        this.logger.warn(
          'Redis indisponível: marcador rotina:pending desligado',
        );
        void client.quit();
        this.redis = null;
      });
    } catch {
      this.redis = null;
    }
  }

  async enqueue(
    rotinaCodigo: number,
    instituicaoCodigo: number,
    trigger: 'SCHEDULE' | 'WEBHOOK',
    requestData?: any,
  ): Promise<{ exeId: string; jobId: string }> {
    const execLog = await this.prisma.rOTExecucaoLog.create({
      data: {
        ROTCodigo: rotinaCodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
        EXEStatus: StatusExecucao.EM_EXECUCAO,
        EXEInicio: new Date(),
        EXETrigger: trigger,
        EXERequestBody: requestData?.body,
        EXERequestParams: requestData?.params,
        EXERequestPath: requestData?.path,
      },
    });

    const exeId = execLog.EXEIdExterno;

    const jobData: RotinaJobData = {
      exeId,
      rotinaCodigo,
      instituicaoCodigo,
      trigger,
      requestEnvelope: requestData,
      enqueuedAt: new Date().toISOString(),
    };

    await this.publishJob(jobData, exeId);
    void this.setPendingMarker(exeId).catch((e) =>
      this.logger.debug(
        `rotina:pending não gravado (${exeId}): ${(e as Error)?.message ?? e}`,
      ),
    );

    this.logger.log(
      `Job enqueued: ${exeId} (rotina=${rotinaCodigo}, trigger=${trigger})`,
    );

    return { exeId, jobId: exeId };
  }

  /**
   * Publica um job INTERNAL de sincronização de registros diários para a instituição.
   * Não cria ROTExecucaoLog — o worker trata esse trigger por ramo próprio.
   */
  async publishRegistroDiarioSyncJob(instituicaoCodigo: number): Promise<string> {
    const exeId = randomUUID();
    const jobData: RotinaJobData = {
      exeId,
      rotinaCodigo: 0,
      instituicaoCodigo,
      trigger: 'INTERNAL',
      enqueuedAt: new Date().toISOString(),
    };
    await this.publishJob(jobData, exeId);
    this.logger.log(`INTERNAL sync job published: ${exeId} (inst=${instituicaoCodigo})`);
    return exeId;
  }

  /**
   * Republica um job na fila reutilizando um ROTExecucaoLog já existente
   * (status/campos devem ter sido resetados antes pelo chamador).
   */
  async requeueExistingExecution(params: {
    exeId: string;
    rotinaCodigo: number;
    instituicaoCodigo: number;
    trigger: 'SCHEDULE' | 'WEBHOOK';
    requestData?: any;
  }): Promise<{ exeId: string; jobId: string }> {
    const { exeId, rotinaCodigo, instituicaoCodigo, trigger, requestData } =
      params;

    const jobData: RotinaJobData = {
      exeId,
      rotinaCodigo,
      instituicaoCodigo,
      trigger,
      requestEnvelope: requestData,
      enqueuedAt: new Date().toISOString(),
    };

    await this.publishJob(jobData, exeId);
    void this.setPendingMarker(exeId).catch((e) =>
      this.logger.debug(
        `rotina:pending não gravado (${exeId}): ${(e as Error)?.message ?? e}`,
      ),
    );

    this.logger.log(
      `Job requeued: ${exeId} (rotina=${rotinaCodigo}, trigger=${trigger})`,
    );

    return { exeId, jobId: exeId };
  }

  private pendingKey(exeId: string) {
    return redisPendingKey(exeId);
  }

  /** Marcador opcional (UX): worker remove ao consumir. TTL evita chave órfã se o Redis da API reiniciar. */
  async setPendingMarker(exeId: string): Promise<void> {
    if (!this.redis) return;
    const ttl = Math.max(
      60,
      parseInt(process.env.ROTINA_PENDING_TTL_SEC || '86400', 10),
    );
    await this.redis.setex(this.pendingKey(exeId), ttl, '1');
  }

  async clearPendingMarker(exeId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.pendingKey(exeId));
    } catch (e) {
      this.logger.debug(
        `rotina:pending não removido (${exeId}): ${(e as Error)?.message ?? e}`,
      );
    }
  }

  async cancelJob(exeId: string): Promise<boolean> {
    const result = await this.prisma.rOTExecucaoLog.updateMany({
      where: {
        EXEIdExterno: exeId,
        EXEStatus: StatusExecucao.EM_EXECUCAO,
      },
      data: {
        EXEStatus: StatusExecucao.CANCELADO,
        EXEFim: new Date(),
        EXEErro: 'Cancelado antes de concluir execução',
      },
    });
    if (result.count > 0) {
      await this.clearPendingMarker(exeId);
    }
    return result.count > 0;
  }

  async sendCancelSignal(exeId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.publish(channelCancel(), JSON.stringify({ exeId }));
    } catch (e) {
      this.logger.debug(
        `Erro ao publicar sinal de cancelamento (${exeId}): ${(e as Error)?.message ?? e}`,
      );
    }
  }

  /**
   * Esvazia `q.rotina.dlq`: republica cada payload na fila da instituição (exchange jobs + routing key)
   * com contador de retry zerado. Marca o ROTExecucaoLog como EM_EXECUCAO para nova tentativa;
   * o worker atualiza status/resultado ao concluir.
   */
  async reprocessDeadLetterQueue(): Promise<ReprocessDeadLetterResult> {
    const MAX_MESSAGES = Math.max(
      1,
      parseInt(process.env.ROTINA_DLQ_REPROCESS_MAX || '5000', 10),
    );
    const channel = await this.getChannel();
    await channel.assertQueue(getJobsDlxQueue(), { durable: true });

    let republished = 0;
    let skippedInvalid = 0;
    const errors: string[] = [];

    for (let n = 0; n < MAX_MESSAGES; n++) {
      const msg = await channel.get(getJobsDlxQueue(), { noAck: false });
      if (!msg) break;

      let data: RotinaJobData;
      try {
        data = JSON.parse(msg.content.toString()) as RotinaJobData;
      } catch {
        skippedInvalid += 1;
        errors.push('Mensagem com JSON inválido (removida da DLQ)');
        channel.ack(msg);
        continue;
      }

      if (
        !data.exeId ||
        typeof data.instituicaoCodigo !== 'number' ||
        typeof data.rotinaCodigo !== 'number' ||
        (data.trigger !== 'SCHEDULE' && data.trigger !== 'WEBHOOK')
      ) {
        skippedInvalid += 1;
        errors.push(
          `Payload inválido (exeId=${String(data?.exeId)}), mensagem removida da DLQ`,
        );
        channel.ack(msg);
        continue;
      }

      await this.prisma.rOTExecucaoLog.updateMany({
        where: { EXEIdExterno: data.exeId },
        data: {
          EXEStatus: StatusExecucao.EM_EXECUCAO,
          EXEInicio: new Date(),
          EXEFim: null,
          EXEDuracaoMs: null,
          EXEErro: null,
          EXEResultado: Prisma.JsonNull,
          EXELogs: Prisma.JsonNull,
        },
      });

      const rawHeaders = (msg.properties.headers || {}) as Record<
        string,
        unknown
      >;
      const headers: Record<string, unknown> = { ...rawHeaders };
      headers[ROTINA_RETRY_HEADER] = 0;
      delete headers['x-final-reason'];

      const properties: Options.Publish = {
        persistent: true,
        headers: headers as Options.Publish['headers'],
        messageId: data.exeId,
        correlationId: (msg.properties.correlationId as string) || data.exeId,
        contentType: msg.properties.contentType || 'application/json',
        timestamp: Date.now(),
      };

      const ok = channel.publish(
        getJobsExchange(),
        String(data.instituicaoCodigo),
        msg.content,
        properties,
      );
      if (!ok) {
        errors.push(
          `Buffer do canal cheio ao republicar ${data.exeId}; mensagem recolocada na DLQ`,
        );
        channel.nack(msg, false, true);
        continue;
      }

      channel.ack(msg);
      republished += 1;
      void this.setPendingMarker(data.exeId).catch(() => {});
    }

    if (republished > 0) {
      this.logger.log(
        `DLQ reprocess: ${republished} mensagem(ns) republicada(s)`,
      );
    }
    return { republished, skippedInvalid, errors };
  }

  async getJobCounts() {
    const institutions = await this.prisma.iNSInstituicao.findMany({
      where: { INSAtivo: true },
      select: { INSCodigo: true },
    });

    let waitingCount = 0;
    const conn = await this.getConnection();
    let checkChannel = await conn.createChannel();

    try {
      for (const inst of institutions) {
        try {
          const qName = getMainQueueName(inst.INSCodigo);
          const qInfo = await checkChannel.checkQueue(qName);
          waitingCount += qInfo.messageCount;
        } catch (e) {
          try {
            await checkChannel.close();
          } catch {}
          checkChannel = await conn.createChannel();
        }
      }

      // Adiciona filas globais
      for (const qName of [getGlobalRetryQueue(), getJobsDlxQueue()]) {
        try {
          const qInfo = await checkChannel.checkQueue(qName);
          waitingCount += qInfo.messageCount;
        } catch (e) {
          try {
            await checkChannel.close();
          } catch {}
          checkChannel = await conn.createChannel();
        }
      }
    } finally {
      try {
        await checkChannel.close();
      } catch {}
    }

    // Contagem de jobs realmente ativos nos workers via Redis Semaphores
    let redisActiveCount = 0;
    if (this.redis) {
      try {
        const inflightKeys = await this.redis.keys(redisInflightPattern());
        const now = Date.now();
        for (const key of inflightKeys) {
          await this.redis.zremrangebyscore(key, '-inf', now);
          const card = await this.redis.zcard(key);
          redisActiveCount += card;
        }
      } catch (e) {
        this.logger.debug('Erro ao contar jobs ativos no Redis:', e);
      }
    }

    return {
      waiting: waitingCount,
      active: redisActiveCount,
      completed: await this.prisma.rOTExecucaoLog.count({
        where: { EXEStatus: StatusExecucao.SUCESSO },
      }),
      failed: await this.prisma.rOTExecucaoLog.count({
        where: { EXEStatus: StatusExecucao.ERRO },
      }),
      delayed: 0,
      paused: 0,
      prioritized: 0,
    };
  }

  /** Mensagens na fila principal da instituição (`SG_CLI_*`), sem DLQ/retry. Fila inexistente => 0. */
  async getMainQueueMessageCount(instituicaoCodigo: number): Promise<number> {
    const qName = getMainQueueName(instituicaoCodigo);
    const conn = await this.getConnection();
    const ch = await conn.createChannel();
    try {
      try {
        const qInfo = await ch.checkQueue(qName);
        return qInfo.messageCount;
      } catch {
        return 0;
      }
    } finally {
      try {
        await ch.close();
      } catch {
        // ignore
      }
    }
  }

  private inflightZkey(instituicaoCodigo: number): string {
    return redisInflightZkeyFn(instituicaoCodigo);
  }

  /**
   * ZSET do semáforo de execução serial por rotina (worker: rotina-consumer).
   * Manter alinhado a worker/src/rotina-consumer.ts.
   */
  serialRotinaInflightZkey(
    instituicaoCodigo: number,
    rotinaCodigo: number,
  ): string {
    return redisSerialInflightZkeyFn(instituicaoCodigo, rotinaCodigo);
  }

  /** Remove o ZSET de semáforo serial da rotina (operação manual se lock ficar preso). */
  async clearSerialInflightZset(
    instituicaoCodigo: number,
    rotinaCodigo: number,
  ): Promise<{ ok: boolean }> {
    if (!this.redis) {
      throw new ServiceUnavailableException('Redis indisponível');
    }
    try {
      await this.redis.unlink(
        this.serialRotinaInflightZkey(instituicaoCodigo, rotinaCodigo),
      );
      return { ok: true };
    } catch (e) {
      this.logger.warn(
        `Falha ao limpar serial inflight (inst=${instituicaoCodigo}, rotina=${rotinaCodigo}):`,
        e,
      );
      throw new ServiceUnavailableException(
        'Falha ao limpar bloqueio serial no Redis',
      );
    }
  }

  /** Execuções em andamento (semáforo Redis) para uma instituição; remove leases expirados antes de contar. */
  async getInflightCountForInstitution(
    instituicaoCodigo: number,
  ): Promise<number> {
    if (!this.redis) return 0;
    try {
      const zkey = this.inflightZkey(instituicaoCodigo);
      const now = Date.now();
      await this.redis.zremrangebyscore(zkey, '-inf', now);
      return await this.redis.zcard(zkey);
    } catch (e) {
      this.logger.debug(`Erro ao contar inflight (${instituicaoCodigo}):`, e);
      return 0;
    }
  }

  /** Lista contagens por instituição (apenas chaves existentes; merge com zeros no cliente). */
  async getInflightCounts(): Promise<
    { instituicaoCodigo: number; inflight: number }[]
  > {
    if (!this.redis) return [];
    try {
      const inflightKeys = await this.redis.keys(redisInflightPattern());
      const now = Date.now();
      const items: { instituicaoCodigo: number; inflight: number }[] = [];
      for (const key of inflightKeys) {
        const m = redisInflightRegex().exec(key);
        if (!m) continue;
        const instituicaoCodigo = parseInt(m[1], 10);
        await this.redis.zremrangebyscore(key, '-inf', now);
        const inflight = await this.redis.zcard(key);
        items.push({ instituicaoCodigo, inflight });
      }
      return items;
    } catch (e) {
      this.logger.debug('Erro ao listar inflight por instituição:', e);
      return [];
    }
  }

  /** Remove o ZSET de semáforo da instituição (uso operacional se contador ficar preso). */
  async resetInflightForInstitution(
    instituicaoCodigo: number,
  ): Promise<{ ok: boolean }> {
    if (!this.redis) {
      throw new ServiceUnavailableException('Redis indisponível');
    }
    try {
      await this.redis.unlink(this.inflightZkey(instituicaoCodigo));
      return { ok: true };
    } catch (e) {
      this.logger.warn(`Falha ao resetar inflight (${instituicaoCodigo}):`, e);
      throw new ServiceUnavailableException(
        'Falha ao resetar contador no Redis',
      );
    }
  }

  private async publishJob(data: RotinaJobData, exeId: string) {
    const channel = await this.getChannel();
    const properties: Options.Publish = {
      persistent: true,
      messageId: exeId,
      correlationId: exeId,
      contentType: 'application/json',
      timestamp: Date.now(),
      headers: {
        'x-rotina-retry-count': 0,
      },
    };

    const payload = Buffer.from(JSON.stringify(data));
    channel.publish(
      getJobsExchange(),
      String(data.instituicaoCodigo),
      payload,
      properties,
    );
  }

  /**
   * Publica no exchange com Ack do broker (`ConfirmChannel`).
   * Usado onde precisa garantir aceite antes de commit em banco (ex.: sync webhook por pessoa).
   */
  async publishJobWithConfirm(data: RotinaJobData, exeId: string): Promise<void> {
    const channel = await this.getConfirmChannel();
    const properties: Options.Publish = {
      persistent: true,
      messageId: exeId,
      correlationId: exeId,
      contentType: 'application/json',
      timestamp: Date.now(),
      headers: {
        'x-rotina-retry-count': 0,
      },
    };

    const payload = Buffer.from(JSON.stringify(data));
    const ok = channel.publish(
      getJobsExchange(),
      String(data.instituicaoCodigo),
      payload,
      properties,
    );
    if (!ok) {
      throw new Error('Buffer do RabbitMQ cheio (publish retornou false)');
    }
    await channel.waitForConfirms();
  }

  private async getChannel(): Promise<amqp.Channel> {
    if (!this.channelPromise) {
      this.channelPromise = this.getConnection().then(async (connection) => {
        const channel = await connection.createChannel();
        await channel.assertExchange(getJobsExchange(), 'direct', {
          durable: true,
        });
        return channel;
      });
    }
    return this.channelPromise;
  }

  private async getConfirmChannel(): Promise<amqp.ConfirmChannel> {
    if (!this.confirmChannelPromise) {
      this.confirmChannelPromise = this.getConnection().then(async (connection) => {
        const channel = await connection.createConfirmChannel();
        await channel.assertExchange(getJobsExchange(), 'direct', {
          durable: true,
        });
        return channel;
      });
    }
    return this.confirmChannelPromise;
  }

  private async getConnection(): Promise<amqp.ChannelModel> {
    if (!this.connectionPromise) {
      this.connectionPromise = amqp.connect(getRabbitUrl());
    }
    return this.connectionPromise;
  }
}
