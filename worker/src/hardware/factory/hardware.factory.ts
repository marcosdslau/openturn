import { PrismaClient, EQPEquipamento } from '@prisma/client';
import { HardwareBrand } from '../interfaces/hardware.types';
import { IHardwareProvider } from '../interfaces/hardware-provider.interface';
import { IBrandFactory } from './brand-factory.interface';
import { ControlIdBrandFactory } from '../brands/controlid/controlid.factory';
import { HikvisionBrandFactory } from '../brands/hikvision/hikvision.factory';
import { IntelbrasBrandFactory } from '../brands/intelbras/intelbras.factory';
import { TopdataBrandFactory } from '../brands/topdata/topdata.factory';
import { WsRelayClient } from '../relay/ws-relay-client';

export class HardwareFactory {
  private readonly controlId: ControlIdBrandFactory;
  private readonly hikvision: HikvisionBrandFactory;
  private readonly intelbras: IntelbrasBrandFactory;
  private readonly topdata: TopdataBrandFactory;

  constructor(
    prisma: PrismaClient,
    wsRelay: WsRelayClient | null,
  ) {
    this.controlId = new ControlIdBrandFactory(prisma, wsRelay);
    this.hikvision = new HikvisionBrandFactory(prisma);
    this.intelbras = new IntelbrasBrandFactory(prisma);
    this.topdata = new TopdataBrandFactory(prisma);
  }

  async resolve(
    equipment: EQPEquipamento,
    overrideHost?: string,
  ): Promise<IHardwareProvider> {
    const brand = this.normalizeBrand(equipment.EQPMarca);
    return this.byBrand(brand).resolve(equipment, overrideHost);
  }

  private normalizeBrand(raw: string | null | undefined): HardwareBrand {
    const s = (raw ?? '').trim();
    if (!s) {
      throw new Error(`Equipment ${raw}: EQPMarca is required`);
    }
    const lower = s.toLowerCase();
    if (lower === 'controlid' || s === HardwareBrand.CONTROLID)
      return HardwareBrand.CONTROLID;
    if (lower === 'hikvision' || s === HardwareBrand.HIKVISION)
      return HardwareBrand.HIKVISION;
    if (lower === 'topdata' || s === HardwareBrand.TOPDATA)
      return HardwareBrand.TOPDATA;
    if (lower === 'intelbras' || s === HardwareBrand.INTELBRAS)
      return HardwareBrand.INTELBRAS;
    throw new Error(`Unsupported hardware brand: ${raw}`);
  }

  private byBrand(brand: HardwareBrand): IBrandFactory {
    switch (brand) {
      case HardwareBrand.CONTROLID:
        return this.controlId;
      case HardwareBrand.HIKVISION:
        return this.hikvision;
      case HardwareBrand.INTELBRAS:
        return this.intelbras;
      case HardwareBrand.TOPDATA:
        return this.topdata;
      default:
        throw new Error(`Unsupported hardware brand: ${brand}`);
    }
  }
}
