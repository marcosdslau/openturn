import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AbstractIntelbrasProvider } from '../abstract/intelbras.abstract';

export class IntelbrasDefaultProvider extends AbstractIntelbrasProvider {
  constructor(config: unknown, prisma: PrismaService) {
    super(config, prisma);
  }
}
