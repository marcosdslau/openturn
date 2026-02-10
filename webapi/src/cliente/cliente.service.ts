import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ClienteService {
    constructor(private prisma: PrismaService) { }

    create(data: Prisma.CLIClienteCreateInput) {
        return this.prisma.cLICliente.create({ data });
    }

    findAll() {
        return this.prisma.cLICliente.findMany();
    }
}
