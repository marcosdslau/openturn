import { PrismaClient } from '@prisma/client';
import { AbstractHikvisionProvider } from '../abstract/hikvision.abstract';

export class HikvisionDefaultProvider extends AbstractHikvisionProvider {
  constructor(config: unknown, prisma: PrismaClient) {
    super(config, prisma);
  }
}
