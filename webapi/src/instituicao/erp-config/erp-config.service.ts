import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateERPConfigDto } from './erp-config.dto';

@Injectable()
export class ERPConfigService {
    constructor(private prisma: PrismaService) { }

    async findByInstituicao(instId: number) {
        return this.prisma.eRPConfiguracao.findFirst({
            where: { INSInstituicaoCodigo: instId },
            orderBy: { ERPCodigo: 'desc' },
        });
    }

    async upsert(instId: number, dto: UpdateERPConfigDto) {
        const existing = await this.findByInstituicao(instId);

        if (existing) {
            return this.prisma.eRPConfiguracao.update({
                where: { ERPCodigo: existing.ERPCodigo },
                data: dto,
            });
        }

        return this.prisma.eRPConfiguracao.create({
            data: {
                ...dto,
                INSInstituicaoCodigo: instId,
            },
        });
    }
}
