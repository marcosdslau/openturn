import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AbstractControlIDProvider } from '../abstract/controlid.abstract';
import { ControlIDConfig } from '../controlid.types';
import { IHttpTransport } from '../../../transport/http-transport.interface';

/** Stub: iDBlock Facial — especializar `*Impl` conforme necessário. */
export class IdBlockFacialControlIDProvider extends AbstractControlIDProvider {
  constructor(
    config: ControlIDConfig,
    prisma: PrismaService,
    transport: IHttpTransport,
  ) {
    super(config, prisma, transport);
  }
}
