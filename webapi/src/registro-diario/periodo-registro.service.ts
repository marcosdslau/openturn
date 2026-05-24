import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePeriodoRegistroDto, UpdatePeriodoRegistroDto } from './dto/periodo-registro.dto';
import { assertNoOverlap, PeriodoInterval } from './periodo-registro-overlap.util';

@Injectable()
export class PeriodoRegistroService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(instituicaoCodigo: number) {
    return this.prisma.pERPeriodosConfig.findMany({
      where: { INSInstituicaoCodigo: instituicaoCodigo },
      orderBy: { PERHorarioInicio: 'asc' },
      select: {
        PERCodigo: true,
        PERNome: true,
        PERHorarioInicio: true,
        PERHorarioFim: true,
        PERToleranciaEntradaMinutos: true,
        PERToleranciaSaidaMinutos: true,
      },
    });
  }

  async create(instituicaoCodigo: number, dto: CreatePeriodoRegistroDto) {
    this.validateHorarios(dto.PERHorarioInicio, dto.PERHorarioFim);

    const existentes = await this.loadExistentes(instituicaoCodigo);
    assertNoOverlap(
      { ...dto, INSInstituicaoCodigo: instituicaoCodigo } as PeriodoInterval,
      existentes,
    );

    return this.prisma.pERPeriodosConfig.create({
      data: { ...dto, INSInstituicaoCodigo: instituicaoCodigo },
      select: {
        PERCodigo: true,
        PERNome: true,
        PERHorarioInicio: true,
        PERHorarioFim: true,
        PERToleranciaEntradaMinutos: true,
        PERToleranciaSaidaMinutos: true,
      },
    });
  }

  async update(instituicaoCodigo: number, perCodigo: number, dto: UpdatePeriodoRegistroDto) {
    const existing = await this.prisma.pERPeriodosConfig.findFirst({
      where: { PERCodigo: perCodigo, INSInstituicaoCodigo: instituicaoCodigo },
    });
    if (!existing) throw new NotFoundException('Período não encontrado');

    const merged: PeriodoInterval = {
      PERCodigo: perCodigo,
      PERNome: dto.PERNome ?? existing.PERNome,
      PERHorarioInicio: dto.PERHorarioInicio ?? existing.PERHorarioInicio,
      PERHorarioFim: dto.PERHorarioFim ?? existing.PERHorarioFim,
      PERToleranciaEntradaMinutos:
        dto.PERToleranciaEntradaMinutos ?? existing.PERToleranciaEntradaMinutos,
      PERToleranciaSaidaMinutos:
        dto.PERToleranciaSaidaMinutos ?? existing.PERToleranciaSaidaMinutos,
    };

    this.validateHorarios(merged.PERHorarioInicio, merged.PERHorarioFim);

    const existentes = await this.loadExistentes(instituicaoCodigo);
    assertNoOverlap(merged, existentes, perCodigo);

    return this.prisma.pERPeriodosConfig.update({
      where: { PERCodigo: perCodigo },
      data: dto,
      select: {
        PERCodigo: true,
        PERNome: true,
        PERHorarioInicio: true,
        PERHorarioFim: true,
        PERToleranciaEntradaMinutos: true,
        PERToleranciaSaidaMinutos: true,
      },
    });
  }

  async remove(instituicaoCodigo: number, perCodigo: number) {
    const existing = await this.prisma.pERPeriodosConfig.findFirst({
      where: { PERCodigo: perCodigo, INSInstituicaoCodigo: instituicaoCodigo },
    });
    if (!existing) throw new NotFoundException('Período não encontrado');

    await this.prisma.pERPeriodosConfig.delete({ where: { PERCodigo: perCodigo } });
    return { ok: true };
  }

  private async loadExistentes(instituicaoCodigo: number): Promise<PeriodoInterval[]> {
    const rows = await this.prisma.pERPeriodosConfig.findMany({
      where: { INSInstituicaoCodigo: instituicaoCodigo },
      select: {
        PERCodigo: true,
        PERNome: true,
        PERHorarioInicio: true,
        PERHorarioFim: true,
        PERToleranciaEntradaMinutos: true,
        PERToleranciaSaidaMinutos: true,
      },
    });
    return rows as PeriodoInterval[];
  }

  private validateHorarios(inicio: string, fim: string): void {
    if (inicio === fim) {
      throw new BadRequestException('PERHorarioInicio e PERHorarioFim não podem ser iguais (duração mínima > 0)');
    }
  }
}
