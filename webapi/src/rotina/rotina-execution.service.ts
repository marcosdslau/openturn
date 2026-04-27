import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RotinaQueueService } from './queue/rotina-queue.service';
import { ExecutionService } from './engine/execution.service';
import { StatusExecucao, Prisma } from '@prisma/client';

@Injectable()
export class RotinaExecutionService {
  private readonly logger = new Logger(RotinaExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rotinaQueueService: RotinaQueueService,
    private readonly executionService: ExecutionService,
  ) {}

  async listExecutions(
    instituicaoCodigo: number,
    query: {
      page?: number;
      limit?: number;
      rotinaCodigo?: number;
      status?: StatusExecucao;
      trigger?: string;
      startDate?: string;
      endDate?: string;
      searchError?: string;
      searchLog?: string;
      searchBody?: string;
      executionId?: string;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ROTExecucaoLogWhereInput = {
      INSInstituicaoCodigo: instituicaoCodigo,
    };

    if (query.rotinaCodigo) {
      where.ROTCodigo = Number(query.rotinaCodigo);
    }

    if (query.status) {
      where.EXEStatus = query.status;
    }

    if (query.trigger) {
      where.EXETrigger = query.trigger;
    }

    if (query.executionId) {
      where.EXEIdExterno = { contains: query.executionId, mode: 'insensitive' };
    }

    if (query.startDate || query.endDate) {
      where.EXEInicio = {};
      if (query.startDate) where.EXEInicio.gte = new Date(query.startDate);
      if (query.endDate) where.EXEInicio.lte = new Date(query.endDate);
    }

    if (query.searchError) {
      where.EXEErro = { contains: query.searchError, mode: 'insensitive' };
    }

    // Filtros complexos (Logs e Body) costumam ser JSON.
    // Se precisarmos de performance extrema em bases gigantes, usaríamos raw SQL ou ElasticSearch.
    // Para este MVP, usaremos filtros de path do Prisma para JSONB se o DB suportar,
    // ou faremos filtros simples onde possível.

    if (query.searchBody) {
      // EXERequestBody é Json.
      // Prisma permite string_contains em campos Json se for PostgreSQL.
      where.EXERequestBody = {
        path: [],
        string_contains: query.searchBody,
      } as any;
    }

    const [total, items] = await Promise.all([
      this.prisma.rOTExecucaoLog.count({ where }),
      this.prisma.rOTExecucaoLog.findMany({
        where,
        include: {
          rotina: {
            select: {
              ROTNome: true,
            },
          },
        },
        orderBy: { EXEInicio: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Filtro de logs em memória se solicitado (Logs são array de objetos no JSON)
    let filteredItems = items;
    if (query.searchLog) {
      const searchLower = query.searchLog.toLowerCase();
      filteredItems = items.filter((item) => {
        const logs = (item.EXELogs as any[]) || [];
        return logs.some(
          (log) =>
            log.message?.toLowerCase().includes(searchLower) ||
            log.level?.toLowerCase().includes(searchLower),
        );
      });
      // Nota: Isso pode afetar a paginação se muitos itens forem filtrados fora.
      // Para uma busca real em logs, o ideal seria o banco suportar ou usar uma ferramenta de logs.
    }

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items: filteredItems,
    };
  }

  async reprocess(exeId: string, instituicaoCodigo: number) {
    const original = await this.prisma.rOTExecucaoLog.findUnique({
      where: { EXEIdExterno: exeId },
      include: { rotina: true },
    });

    if (!original || original.INSInstituicaoCodigo !== instituicaoCodigo) {
      throw new NotFoundException('Execução não encontrada');
    }

    const trigger = original.EXETrigger as any;
    const requestData = {
      body: original.EXERequestBody,
      params: original.EXERequestParams,
      path: original.EXERequestPath,
    };

    if (trigger === 'MANUAL') {
      return this.executionService.startExecution(
        original.ROTCodigo,
        instituicaoCodigo,
        'MANUAL',
        { ...requestData, manual: true },
        { skipActiveCheck: true },
      );
    } else {
      return this.rotinaQueueService.enqueue(
        original.ROTCodigo,
        instituicaoCodigo,
        trigger === 'SCHEDULE' ? 'SCHEDULE' : 'WEBHOOK',
        requestData,
      );
    }
  }

  async deleteExecutions(ids: string[], instituicaoCodigo: number) {
    return this.prisma.rOTExecucaoLog.deleteMany({
      where: {
        EXEIdExterno: { in: ids },
        INSInstituicaoCodigo: instituicaoCodigo,
        EXEStatus: { not: StatusExecucao.EM_EXECUCAO }, // Segurança: não deletar o que está rodando
      },
    });
  }

  async bulkAction(
    instituicaoCodigo: number,
    data: { action: 'delete' | 'reprocess' | 'cancel'; ids: string[] },
  ) {
    const { action, ids } = data;

    if (action === 'delete') {
      return this.deleteExecutions(ids, instituicaoCodigo);
    }

    if (action === 'cancel') {
      const results: any[] = [];
      for (const id of ids) {
        try {
          results.push(await this.cancelIndividual(id, instituicaoCodigo));
        } catch (e) {
          this.logger.error(`Erro ao cancelar ${id}: ${e.message}`);
        }
      }
      return { processed: results.filter(Boolean).length };
    }

    if (action === 'reprocess') {
      const results: any[] = [];
      for (const id of ids) {
        try {
          results.push(await this.reprocess(id, instituicaoCodigo));
        } catch (e) {
          this.logger.error(`Erro ao reprocessar ${id}: ${e.message}`);
        }
      }
      return { processed: results.length };
    }
  }

  private async cancelIndividual(exeId: string, instituicaoCodigo: number) {
    const exec = await this.prisma.rOTExecucaoLog.findUnique({
      where: { EXEIdExterno: exeId },
    });

    if (!exec || exec.INSInstituicaoCodigo !== instituicaoCodigo) return null;
    if (exec.EXEStatus !== StatusExecucao.EM_EXECUCAO) return null;

    // Marca como cancelado
    await this.rotinaQueueService.cancelJob(exeId);
    await this.rotinaQueueService.sendCancelSignal(exeId);

    return exeId;
  }
}
