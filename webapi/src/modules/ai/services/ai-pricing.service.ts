import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class AiPricingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Lista todos os modelos de IA ativos disponíveis na plataforma
   */
  async getAvailableModels() {
    return await this.prisma.aIMModeloIa.findMany({
      where: { AIMAtivo: true },
      include: { provedor: true },
    });
  }
}
