import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AbstractTopdataProvider } from '../abstract/topdata.abstract';

export class TopdataDefaultProvider extends AbstractTopdataProvider {
  constructor(config: unknown, prisma: PrismaService) {
    super(config, prisma);
  }
}
