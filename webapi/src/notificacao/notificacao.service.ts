import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { QueryNotificacaoDto } from './dto/notificacao.dto';

@Injectable()
export class NotificacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    instituicaoCodigo: number,
    query: QueryNotificacaoDto,
  ): Promise<PaginatedResult<any>> {
    const { page, limit, lido } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      INSInstituicaoCodigo: instituicaoCodigo,
      ...(lido === undefined ? {} : { lido }),
    };

    const [data, total] = await Promise.all([
      this.prisma.rls.nOTNotificacao.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { NOTCodigo: 'desc' }],
      }),
      this.prisma.rls.nOTNotificacao.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async markAsRead(instituicaoCodigo: number, id: number) {
    const existing = await this.prisma.rls.nOTNotificacao.findFirst({
      where: { NOTCodigo: id, INSInstituicaoCodigo: instituicaoCodigo },
      select: { NOTCodigo: true, lido: true },
    });
    if (!existing) {
      throw new NotFoundException('Notificação não encontrada');
    }
    if (existing.lido) {
      return this.prisma.rls.nOTNotificacao.findUnique({
        where: { NOTCodigo: id },
      });
    }
    return this.prisma.rls.nOTNotificacao.update({
      where: { NOTCodigo: id },
      data: { lido: true },
    });
  }
}
