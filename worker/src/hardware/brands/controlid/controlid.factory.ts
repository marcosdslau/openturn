import { PrismaClient, EQPEquipamento } from '@prisma/client';
import { IHardwareProvider } from '../../interfaces/hardware-provider.interface';
import { IBrandFactory } from '../../factory/brand-factory.interface';
import { DirectHttpTransport } from '../../transport/direct-http.transport';
import { WsRelayClientHttpTransport } from '../../transport/ws-relay-client-http.transport';
import { IHttpTransport } from '../../transport/http-transport.interface';
import { WsRelayClient } from '../../relay/ws-relay-client';
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

export class ControlIdBrandFactory implements IBrandFactory {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly wsRelay: WsRelayClient | null,
  ) {}

  async resolve(
    equipment: EQPEquipamento,
    overrideHost?: string,
  ): Promise<IHardwareProvider> {
    const cfg = (equipment.EQPConfig || {}) as unknown as Partial<ControlIDConfig>;

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
      if (!this.wsRelay) {
        throw new Error(
          'Equipamento com addon (EQPUsaAddon) requer conexão ao relay (WEBAPI_WS_URL e RELAY_INTERNAL_TOKEN) no worker.',
        );
      }
      const connector = await this.prisma.cONConnector.findUnique({
        where: { INSInstituicaoCodigo: equipment.INSInstituicaoCodigo },
      });
      if (!connector) {
        throw new Error(
          `Nenhum Connector pareado para a instituição ${equipment.INSInstituicaoCodigo}`,
        );
      }
      relayMultiHost = {
        wsRelay: this.wsRelay,
        instituicaoCodigo: equipment.INSInstituicaoCodigo,
        equipmentId: equipment.EQPCodigo,
      };
      return {
        transport: new WsRelayClientHttpTransport(
          this.wsRelay,
          equipment.INSInstituicaoCodigo,
          equipment.EQPCodigo,
          baseURL,
        ),
        relayMultiHost,
      };
    }

    return { transport: new DirectHttpTransport(baseURL) };
  }
}
