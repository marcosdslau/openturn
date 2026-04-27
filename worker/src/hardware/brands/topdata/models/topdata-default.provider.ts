import { PrismaClient } from '@prisma/client';
import { AbstractTopdataProvider } from '../abstract/topdata.abstract';

export class TopdataDefaultProvider extends AbstractTopdataProvider {
  constructor(config: unknown, prisma: PrismaClient) {
    super(config, prisma);
  }
}
