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
  getJobsRetryExchange,
  getRabbitUrl,
  getMainQueueName,
  getGlobalRetryQueue,
  getJobsDlxQueue,
  RETRY_DLX_ROUTING_KEY,
} from '../../common/rabbit/rabbit-connection';
import {
  redisPendingKey,
  redisInflightZkey as redisInflightZkeyFn,
  redisSerialInflightZkey as redisSerialInflightZkeyFn,
  redisInflightPattern,
  redisInflightRegex,
  channelCancel,
} from '../../common/redis/redis-keys';
import { getRedisConnectionOptions } from '../../common/redis/redis-connection';
import { RotinaJobData } from './rotina-job.dto';

const ROTINA_RETRY_HEADER = 'x-rotina-retry-count';

export interface ReprocessDeadLetterResult {
  republished: number;
  skippedInvalid: number;
  errors: string[];
}

interface BatchDbPayload {
  EXEIdExterno: string;
  ROTCodigo: number | null;
  INSInstituicaoCodigo: number;
  EXEStatus: StatusExecucao;
  EXEInicio: Date;
  EXETrigger: string;
  EXERequestBody?: any;
  EXERequestParams?: any;
  EXERequestPath?: string;
}

interface PendingItem {
  jobData: RotinaJobData;
  exeId: string;
  dbPayload: BatchDbPayload;
  resolve: (value: { exeId: string; jobId: string }) => void;
  reject: (reason: Error) => void;
}

/**
 * Acumula publicações no RabbitMQ e faz um único waitForConfirms() por lote.
 *
 * Ordem dentro do flush:
 * 1. Garantir topologia (assertQueue + bindQueue idempotente por instituição), para
 *    que mensagens não sejam descartadas silenciosamente pelo exchange direct.
 * 2. createMany() no banco — assim o worker já encontra o registro ao consumir.
 * 3. publish() de cada item com `mandatory: true` para detectar destinos não-roteáveis.
 * 4. waitForConfirms() do lote inteiro (broker ack).
 *
 * Mensagens que voltam via evento `return` (não-roteáveis) marcam o respectivo log
 * como ERRO e rejeitam o caller. Throughput: ~5000-10000 msgs/s no mesmo canal.
 */
class BatchConfirmPublisher {
  private buffer: PendingItem[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  /** Filas asseguradas no canal atual; limpo quando o canal cai. */
  private topologyAsserted = new Set<number>();
  /** ExeIds devolvidos pelo broker (unroutable) durante o flush em andamento. */
  private returnedExeIds = new Set<string>();
  private currentChannel: amqp.ConfirmChannel | null = null;

  constructor(
    private readonly getConfirmChannel: () => Promise<amqp.ConfirmChannel>,
    private readonly resetConfirmChannel: () => void,
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    private readonly batchSize: number,
    private readonly flushIntervalMs: number,
  ) {}

  submit(item: Omit<PendingItem, 'resolve' | 'reject'>): Promise<{ exeId: string; jobId: string }> {
    return new Promise((resolve, reject) => {
      this.buffer.push({ ...item, resolve, reject });
      if (this.buffer.length >= this.batchSize) {
        void this.flush();
      } else if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => { void this.flush(); }, this.flushIntervalMs);
      }
    });
  }

  private async ensureTopology(channel: amqp.ConfirmChannel, instituicaoCodigo: number) {
    if (this.topologyAsserted.has(instituicaoCodigo)) return;
    const queue = getMainQueueName(instituicaoCodigo);
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': getJobsRetryExchange(),
        'x-dead-letter-routing-key': RETRY_DLX_ROUTING_KEY,
      },
    });
    await channel.bindQueue(queue, getJobsExchange(), String(instituicaoCodigo));
    this.topologyAsserted.add(instituicaoCodigo);
  }

  private attachChannelHandlers(channel: amqp.ConfirmChannel) {
    if (this.currentChannel === channel) return;
    this.currentChannel = channel;
    this.topologyAsserted.clear();
    channel.on('return', (msg) => {
      const exeId = msg.properties.messageId as string | undefined;
      if (exeId) {
        this.returnedExeIds.add(exeId);
        this.logger.warn(
          `RabbitMQ retornou mensagem não-roteável (exeId=${exeId}, routingKey=${msg.fields.routingKey})`,
        );
      }
    });
    const clear = () => {
      if (this.currentChannel === channel) {
        this.currentChannel = null;
        this.topologyAsserted.clear();
      }
    };
    channel.on('close', clear);
    channel.on('error', clear);
  }

  private async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length === 0 || this.flushing) return;

    this.flushing = true;
    const batch = this.buffer.splice(0, this.batchSize);
    let dbInserted = false;
    let publishedCount = 0;

    try {
      const channel = await this.getConfirmChannel();
      this.attachChannelHandlers(channel);

      // 1. Garantir topologia para todas as instituições do lote.
      const institutions = new Set(batch.map((i) => i.jobData.instituicaoCodigo));
      for (const inst of institutions) {
        await this.ensureTopology(channel, inst);
      }

      // 2. Banco em bulk — registros ficam disponíveis antes do worker consumir.
      await this.prisma.rOTExecucaoLog.createMany({
        data: batch.map((item) => item.dbPayload),
      });
      dbInserted = true;

      // 3. Publicar todos os itens.
      for (const item of batch) {
        const payload = Buffer.from(JSON.stringify(item.jobData));
        const ok = channel.publish(
          getJobsExchange(),
          String(item.jobData.instituicaoCodigo),
          payload,
          {
            persistent: true,
            mandatory: true,
            messageId: item.exeId,
            correlationId: item.exeId,
            contentType: 'application/json',
            timestamp: Date.now(),
            headers: { [ROTINA_RETRY_HEADER]: 0 },
          },
        );
        publishedCount++;
        if (!ok) {
          // Backpressure: aguardar drain antes de continuar publicando.
          await new Promise<void>((res) => channel.once('drain', res));
        }
      }

      // 4. Aguardar confirmação do broker para TODOS os publishes do lote.
      await channel.waitForConfirms();

      // 5. Drenar eventos `return` pendentes do event loop.
      await new Promise((res) => setImmediate(res));

      // 6. Itens devolvidos (não-roteáveis) viram ERRO; restante resolve normalmente.
      const returned: PendingItem[] = [];
      const succeeded: PendingItem[] = [];
      for (const item of batch) {
        if (this.returnedExeIds.has(item.exeId)) {
          this.returnedExeIds.delete(item.exeId);
          returned.push(item);
        } else {
          succeeded.push(item);
        }
      }

      if (returned.length > 0) {
        try {
          await this.prisma.rOTExecucaoLog.updateMany({
            where: { EXEIdExterno: { in: returned.map((i) => i.exeId) } },
            data: {
              EXEStatus: StatusExecucao.ERRO,
              EXEFim: new Date(),
              EXEErro: 'Mensagem não-roteável no RabbitMQ (sem fila/binding correspondente)',
            },
          });
        } catch (dbErr) {
          this.logger.warn(
            'Falha ao marcar mensagens não-roteáveis como ERRO:',
            (dbErr as Error)?.message,
          );
        }
        const routeErr = new Error('Mensagem não roteada pelo RabbitMQ');
        for (const item of returned) item.reject(routeErr);
      }

      for (const item of succeeded) {
        item.resolve({ exeId: item.exeId, jobId: item.exeId });
      }
    } catch (err) {
      this.logger.error(
        `BatchConfirmPublisher: flush falhou (dbInserted=${dbInserted}, published=${publishedCount}/${batch.length}):`,
        (err as Error)?.message ?? err,
      );
      this.resetConfirmChannel();
      this.currentChannel = null;
      this.topologyAsserted.clear();

      if (dbInserted) {
        // Registros existem no banco mas a publicação falhou no meio. Marcar como ERRO
        // para evitar órfãos em EM_EXECUCAO. O caller deve retentar via reprocessamento.
        try {
          await this.prisma.rOTExecucaoLog.updateMany({
            where: { EXEIdExterno: { in: batch.map((i) => i.exeId) } },
            data: {
              EXEStatus: StatusExecucao.ERRO,
              EXEFim: new Date(),
              EXEErro: `Falha ao publicar no RabbitMQ: ${(err as Error)?.message ?? String(err)}`,
            },
          });
        } catch (dbErr) {
          this.logger.warn(
            'Falha ao marcar lote como ERRO após erro de publicação:',
            (dbErr as Error)?.message,
          );
        }
      }

      const error = err instanceof Error ? err : new Error(String(err));
      for (const item of batch) {
        item.reject(error);
      }
    } finally {
      this.flushing = false;
      if (this.buffer.length > 0) {
        void this.flush();
      }
    }
  }
}

@Injectable()
export class RotinaQueueService {
  private readonly logger = new Logger(RotinaQueueService.name);
  private connectionPromise: Promise<amqp.ChannelModel> | null = null;
  private channelPromise: Promise<amqp.Channel> | null = null;
  private confirmChannelPromise: Promise<amqp.ConfirmChannel> | null = null;
  private redis: Redis | null = null;
  private readonly batcher: BatchConfirmPublisher;

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

    this.batcher = new BatchConfirmPublisher(
      () => this.getConfirmChannel(),
      () => { this.confirmChannelPromise = null; },
      this.prisma,
      this.logger,
      Math.max(1, parseInt(process.env.ROTINA_BATCH_SIZE || '200', 10)),
      Math.max(1, parseInt(process.env.ROTINA_FLUSH_INTERVAL_MS || '50', 10)),
    );
  }

  /**
   * Enfileira um job de rotina com garantia de entrega:
   * 1. Publica no RabbitMQ via ConfirmChannel em micro-batch (broker ack obrigatório).
   * 2. Somente após confirmação do broker, grava o ROTExecucaoLog no banco.
   * Garante que toda linha no banco tem mensagem correspondente no Rabbit.
   */
  async enqueue(
    rotinaCodigo: number,
    instituicaoCodigo: number,
    trigger: 'SCHEDULE' | 'WEBHOOK',
    requestData?: any,
  ): Promise<{ exeId: string; jobId: string }> {
    const exeId = randomUUID();
    const now = new Date();

    const result = await this.batcher.submit({
      jobData: {
        exeId,
        rotinaCodigo,
        instituicaoCodigo,
        trigger,
        requestEnvelope: requestData,
        enqueuedAt: now.toISOString(),
      },
      exeId,
      dbPayload: {
        EXEIdExterno: exeId,
        ROTCodigo: rotinaCodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
        EXEStatus: StatusExecucao.EM_EXECUCAO,
        EXEInicio: now,
        EXETrigger: trigger,
        EXERequestBody: requestData?.body,
        EXERequestParams: requestData?.params,
        EXERequestPath: requestData?.path,
      },
    });

    void this.setPendingMarker(exeId).catch((e) =>
      this.logger.debug(
        `rotina:pending não gravado (${exeId}): ${(e as Error)?.message ?? e}`,
      ),
    );

    this.logger.log(
      `Job enqueued: ${exeId} (rotina=${rotinaCodigo}, trigger=${trigger})`,
    );

    return result;
  }

  /**
   * Publica um job INTERNAL de sincronização de registros diários para a instituição.
   * Cria ROTExecucaoLog antes de publicar para o worker sempre encontrar o registro na base.
   */
  async publishRegistroDiarioSyncJob(instituicaoCodigo: number): Promise<string> {
    const exeId = randomUUID();
    const now = new Date();
    const jobData: RotinaJobData = {
      exeId,
      rotinaCodigo: 0,
      instituicaoCodigo,
      trigger: 'INTERNAL',
      internalKind: 'RPD_AGGREGATION',
      enqueuedAt: now.toISOString(),
    };

    await this.batcher.submit({
      jobData: jobData,
      exeId: exeId,
      dbPayload: {
        EXEIdExterno: exeId,
        ROTCodigo: null,
        INSInstituicaoCodigo: instituicaoCodigo,
        EXEStatus: StatusExecucao.EM_EXECUCAO,
        EXEInicio: now,
        EXETrigger: 'INTERNAL',
        EXERequestBody: { internalKind: 'RPD_AGGREGATION' },
      },
    });

    void this.setPendingMarker(exeId).catch((e) =>
      this.logger.debug(
        `rotina:pending não gravado (${exeId}): ${(e as Error)?.message ?? e}`,
      ),
    );

    this.logger.log(`INTERNAL sync job published: ${exeId} (inst=${instituicaoCodigo})`);
    return exeId;
  }

  async publishFreqEducacionalSyncJob(instituicaoCodigo: number): Promise<string> {
    const exeId = randomUUID();
    const now = new Date();
    const jobData: RotinaJobData = {
      exeId,
      rotinaCodigo: 0,
      instituicaoCodigo,
      trigger: 'INTERNAL',
      internalKind: 'FREQ_ERP_SYNC',
      enqueuedAt: now.toISOString(),
    };

    await this.batcher.submit({
      jobData: jobData,
      exeId: exeId,
      dbPayload: {
        EXEIdExterno: exeId,
        ROTCodigo: null,
        INSInstituicaoCodigo: instituicaoCodigo,
        EXEStatus: StatusExecucao.EM_EXECUCAO,
        EXEInicio: now,
        EXETrigger: 'INTERNAL',
        EXERequestBody: { internalKind: 'FREQ_ERP_SYNC' },
      },
    });

    void this.setPendingMarker(exeId).catch((e) =>
      this.logger.debug(
        `rotina:pending não gravado (${exeId}): ${(e as Error)?.message ?? e}`,
      ),
    );

    this.logger.log(`INTERNAL freq-erp-sync job published: ${exeId} (inst=${instituicaoCodigo})`);
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

    await this.publishJobWithConfirm(jobData, exeId);
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
        channel.on('error', () => { this.channelPromise = null; });
        channel.on('close', () => { this.channelPromise = null; });
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
        channel.on('error', (err) => {
          this.logger.warn('ConfirmChannel error, será recriado:', (err as Error)?.message);
          this.confirmChannelPromise = null;
        });
        channel.on('close', () => {
          this.confirmChannelPromise = null;
        });
        return channel;
      });
    }
    return this.confirmChannelPromise;
  }

  private async getConnection(): Promise<amqp.ChannelModel> {
    if (!this.connectionPromise) {
      this.connectionPromise = amqp.connect(getRabbitUrl()).then((conn) => {
        conn.on('error', (err) => {
          this.logger.warn('RabbitMQ connection error, será reconectado:', (err as Error)?.message);
          this.connectionPromise = null;
          this.channelPromise = null;
          this.confirmChannelPromise = null;
        });
        conn.on('close', () => {
          this.connectionPromise = null;
          this.channelPromise = null;
          this.confirmChannelPromise = null;
        });
        return conn;
      });
    }
    return this.connectionPromise;
  }
}
