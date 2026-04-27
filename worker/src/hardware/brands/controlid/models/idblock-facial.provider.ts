import { PrismaClient } from '@prisma/client';
import { AbstractControlIDProvider } from '../abstract/controlid.abstract';
import {
  ControlIDConfig,
  ControlIdRelayMultiHostContext,
} from '../controlid.types';
import { IHttpTransport } from '../../../transport/http-transport.interface';

/** Stub: iDBlock Facial — especializar `*Impl` conforme necessário. */
export class IdBlockFacialControlIDProvider extends AbstractControlIDProvider {
  constructor(
    config: ControlIDConfig,
    prisma: PrismaClient,
    transport: IHttpTransport,
    relayMultiHost?: ControlIdRelayMultiHostContext,
  ) {
    super(config, prisma, transport, relayMultiHost);
  }
}
