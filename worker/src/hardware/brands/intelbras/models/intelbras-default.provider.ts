import { PrismaClient } from '@prisma/client';
import { AbstractIntelbrasProvider } from '../abstract/intelbras.abstract';

export class IntelbrasDefaultProvider extends AbstractIntelbrasProvider {
  constructor(config: unknown, prisma: PrismaClient) {
    super(config, prisma);
  }
}
