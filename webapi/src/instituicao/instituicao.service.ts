import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InstituicaoService {
    constructor(private prisma: PrismaService) { }

    create(data: Prisma.INSInstituicaoUncheckedCreateInput) {
        return this.prisma.iNSInstituicao.create({ data });
    }

    findAll() {
        // Para listar instituições, geralmente usamos o prisma normal ou RLS dependendo do cargo
        return this.prisma.iNSInstituicao.findMany();
    }

    findOne(id: number) {
        return this.prisma.iNSInstituicao.findUnique({ where: { INSCodigo: id } });
    }
}
