import { PrismaClient } from '@prisma/client';
import { AbstractControlIDProvider } from '../abstract/controlid.abstract';
import {
  ControlIDConfig,
  ControlIdRelayMultiHostContext,
} from '../controlid.types';
import { IHttpTransport } from '../../../transport/http-transport.interface';

/** Stub: override pontos `*Impl` quando o protocolo iDBlock divergir do default. */
export class IdBlockControlIDProvider extends AbstractControlIDProvider {
  constructor(
    config: ControlIDConfig,
    prisma: PrismaClient,
    transport: IHttpTransport,
    relayMultiHost?: ControlIdRelayMultiHostContext,
  ) {
    super(config, prisma, transport, relayMultiHost);
  }
}
