import { Injectable } from '@nestjs/common';
import { EQPEquipamento } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WsRelayGateway } from '../../../connector/ws-relay.gateway';
import { ConnectorService } from '../../../connector/connector.service';
import { IHardwareProvider } from '../../interfaces/hardware-provider.interface';
import { IBrandFactory } from '../../factory/brand-factory.interface';
import { DirectHttpTransport } from '../../transport/direct-http.transport';
import { WsRelayHttpTransport } from '../../transport/ws-relay-http.transport';
import { IHttpTransport } from '../../transport/http-transport.interface';
import {
  ControlIDConfig,
  ControlIDModel,
  ControlIDMode,
  ControlIdRelayMultiHostContext,
  normalizeControlIdModel,
} from './controlid.types';
import { ControlIdDefaultProvider } from './models/controlid-default.provider';
import { IdBlockControlIDProvider } from './models/idblock.provider';
import { IdBlockNextControlIDProvider } from './models/idblock-next.provider';
import { IdBlockFacialControlIDProvider } from './models/idblock-facial.provider';
import { IdFaceMaxControlIDProvider } from './models/idfacemax.provider';
import { IdFaceControlIDProvider } from './models/idface.provider';

@Injectable()
export class ControlIdBrandFactory implements IBrandFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsRelay: WsRelayGateway,
    private readonly connectorService: ConnectorService,
  ) {}

  async resolve(
    equipment: EQPEquipamento,
    overrideHost?: string,
  ): Promise<IHardwareProvider> {
    const cfg = (equipment.EQPConfig ||
      {}) as unknown as Partial<ControlIDConfig>;

    const host =
      overrideHost ||
      cfg.host ||
      cfg.ip_entry ||
      cfg.ip_exit ||
      equipment.EQPEnderecoIp;
    if (!host) {
      throw new Error(
        `Invalid configuration for equipment ${equipment.EQPCodigo}: No valid host/IP found.`,
      );
    }

    const effectiveConfig: ControlIDConfig = {
      port: cfg.port ?? 80,
      user: cfg.user ?? 'admin',
      pass: cfg.pass ?? 'admin',
      mode: (cfg.mode as ControlIDMode) ?? ControlIDMode.STANDALONE,
      ...cfg,
      host,
      model: equipment.EQPModelo || cfg.model,
    };

    const { transport, relayMultiHost } = await this.createTransport(
      equipment,
      effectiveConfig,
    );
    const model = normalizeControlIdModel(equipment.EQPModelo);

    switch (model) {
      case ControlIDModel.IDBLOCK:
        return new IdBlockControlIDProvider(
          effectiveConfig,
          this.prisma,
          transport,
          relayMultiHost,
        );
      case ControlIDModel.IDBLOCK_NEXT:
        return new IdBlockNextControlIDProvider(
          effectiveConfig,
          this.prisma,
          transport,
          relayMultiHost,
        );
      case ControlIDModel.IDBLOCK_FACIAL:
        return new IdBlockFacialControlIDProvider(
          effectiveConfig,
          this.prisma,
          transport,
          relayMultiHost,
        );
      case ControlIDModel.IDFACEMAX:
        return new IdFaceMaxControlIDProvider(
          effectiveConfig,
          this.prisma,
          transport,
          relayMultiHost,
        );
      case ControlIDModel.IDFACE:
        return new IdFaceControlIDProvider(
          effectiveConfig,
          this.prisma,
          transport,
          relayMultiHost,
        );
      default:
        return new ControlIdDefaultProvider(
          effectiveConfig,
          this.prisma,
          transport,
          relayMultiHost,
        );
    }
  }

  private async createTransport(
    equipment: EQPEquipamento,
    config: ControlIDConfig,
  ): Promise<{
    transport: IHttpTransport;
    relayMultiHost?: ControlIdRelayMultiHostContext;
  }> {
    let host = config.host;
    let protocol = 'http';

    if (host.includes('://')) {
      const parts = host.split('://');
      protocol = parts[0];
      host = parts[1];
    }

    let baseURL = `${protocol}://${host}`;
    if (!host.includes(':')) {
      baseURL += `:${config.port || 80}`;
    }

    let relayMultiHost: ControlIdRelayMultiHostContext | undefined;
    if (equipment.EQPUsaAddon) {
      const connector = await this.connectorService.findByInstituicao(
        equipment.INSInstituicaoCodigo,
      );
      relayMultiHost = {
        wsRelay: this.wsRelay,
        connectorCodigo: connector.CONCodigo,
        equipmentId: equipment.EQPCodigo,
      };
      return {
        transport: new WsRelayHttpTransport(
          this.wsRelay,
          relayMultiHost.connectorCodigo,
          equipment.EQPCodigo,
          baseURL,
        ),
        relayMultiHost,
      };
    }

    return { transport: new DirectHttpTransport(baseURL) };
  }
}
