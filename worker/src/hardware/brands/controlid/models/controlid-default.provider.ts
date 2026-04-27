import { PrismaClient } from '@prisma/client';
import { AbstractControlIDProvider } from '../abstract/controlid.abstract';
import {
  ControlIDConfig,
  ControlIdRelayMultiHostContext,
} from '../controlid.types';
import { IHttpTransport } from '../../../transport/http-transport.interface';

/** Comportamento padrão ControlID (equivalente ao provider legado com `switch(model) { default }`). */
export class ControlIdDefaultProvider extends AbstractControlIDProvider {
  constructor(
    config: ControlIDConfig,
    prisma: PrismaClient,
    transport: IHttpTransport,
    relayMultiHost?: ControlIdRelayMultiHostContext,
  ) {
    super(config, prisma, transport, relayMultiHost);
  }
}
