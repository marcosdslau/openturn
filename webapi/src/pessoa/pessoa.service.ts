import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PessoaService {
    constructor(private prisma: PrismaService) { }

    create(data: Prisma.PESPessoaCreateInput) {
        return this.prisma.rls.pESPessoa.create({ data });
    }

    findAll() {
        return this.prisma.rls.pESPessoa.findMany();
    }

    findOne(id: number) {
        return this.prisma.rls.pESPessoa.findUnique({ where: { PESCodigo: id } });
    }
}
