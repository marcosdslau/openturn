import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AbstractControlIDProvider } from '../abstract/controlid.abstract';
import { ControlIDConfig } from '../controlid.types';
import { IHttpTransport } from '../../../transport/http-transport.interface';

/** Stub: override pontos `*Impl` quando o protocolo iDBlock divergir do default. */
export class IdBlockControlIDProvider extends AbstractControlIDProvider {
  constructor(
    config: ControlIDConfig,
    prisma: PrismaService,
    transport: IHttpTransport,
  ) {
    super(config, prisma, transport);
  }
}
