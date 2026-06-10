import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class VisitanteService {
  constructor(private readonly prisma: PrismaService) {}

  async listEquipamentosAtivos(instituicaoCodigo: number) {
    return this.prisma.rls.eQPEquipamento.findMany({
      where: {
        INSInstituicaoCodigo: instituicaoCodigo,
        EQPAtivo: true,
      },
      select: {
        EQPCodigo: true,
        EQPDescricao: true,
        EQPMarca: true,
        EQPModelo: true,
      },
      orderBy: { EQPDescricao: 'asc' },
    });
  }
}
