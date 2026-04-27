import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AbstractControlIDProvider } from '../abstract/controlid.abstract';
import { ControlIDConfig } from '../controlid.types';
import { IHttpTransport } from '../../../transport/http-transport.interface';

/** Comportamento padrão ControlID (equivalente ao provider legado com `switch(model) { default }`). */
export class ControlIdDefaultProvider extends AbstractControlIDProvider {
  constructor(
    config: ControlIDConfig,
    prisma: PrismaService,
    transport: IHttpTransport,
  ) {
    super(config, prisma, transport);
  }
}
