import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AbstractHikvisionProvider } from '../abstract/hikvision.abstract';

export class HikvisionDefaultProvider extends AbstractHikvisionProvider {
  constructor(config: unknown, prisma: PrismaService) {
    super(config, prisma);
  }
}
