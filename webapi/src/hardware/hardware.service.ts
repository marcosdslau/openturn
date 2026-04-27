import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EQPEquipamento } from '@prisma/client';
import { IHardwareProvider } from './interfaces/hardware-provider.interface';
import { HardwareFactory } from './factory/hardware.factory';
import { ControlIDConfig } from './brands/controlid/controlid.types';

@Injectable()
export class HardwareService {
  private readonly logger = new Logger(HardwareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hardwareFactory: HardwareFactory,
  ) {}

  async instantiate(
    equipment: EQPEquipamento,
    overrideHost?: string,
  ): Promise<IHardwareProvider> {
    return this.hardwareFactory.resolve(equipment, overrideHost);
  }

  async syncAll(instituicaoId: number) {
    const devices = await this.prisma.eQPEquipamento.findMany({
      where: { INSInstituicaoCodigo: instituicaoId, EQPAtivo: true },
    });

    const people = await this.prisma.pESPessoa.findMany({
      where: { INSInstituicaoCodigo: instituicaoId, PESAtivo: true },
    });

    for (const dev of devices) {
      try {
        const provider = await this.instantiate(dev);
        for (const person of people) {
          let fingers: string[] = [];
          if (person.PESTemplates && Array.isArray(person.PESTemplates)) {
            fingers = person.PESTemplates as string[];
          }

          const mapping =
            await this.prisma.rls.pESEquipamentoMapeamento.findUnique({
              where: {
                PESCodigo_EQPCodigo: {
                  PESCodigo: person.PESCodigo,
                  EQPCodigo: dev.EQPCodigo,
                },
              },
            });

          await provider.syncPerson(dev.EQPCodigo, {
            id: mapping
              ? parseInt(mapping.PEQIdNoEquipamento, 10)
              : person.PESCodigo,
            name: person.PESNome,
            cpf: person.PESDocumento || undefined,
            faceExtension: person.PESFotoExtensao || 'jpg',
            tags: person.PESCartaoTag ? [person.PESCartaoTag] : [],
            faces: person.PESFotoBase64 ? [person.PESFotoBase64] : [],
            fingers: fingers,
          });
        }
      } catch (e) {
        this.logger.error(`Failed to sync device ${dev.EQPCodigo}`, e);
      }
    }
  }

  async executeCommand(
    equipmentId: number,
    command: string,
    params?: any,
    targetIp?: string,
  ): Promise<any> {
    const device = await this.prisma.eQPEquipamento.findUnique({
      where: { EQPCodigo: equipmentId },
    });

    if (!device) {
      throw new Error(`Equipment ${equipmentId} not found`);
    }

    if (targetIp) {
      const config = device.EQPConfig as unknown as ControlIDConfig;
      const allowedIps = [
        device.EQPEnderecoIp,
        config?.host,
        config?.ip_entry,
        config?.ip_exit,
      ].filter((ip) => !!ip);

      if (!allowedIps.includes(targetIp)) {
        throw new Error(
          `Invalid target IP ${targetIp} for device ${equipmentId}`,
        );
      }
    }

    const provider = await this.instantiate(device, targetIp);
    return await provider.customCommand(command, params);
  }

  async executeProviderAction(
    equipmentId: number,
    method: keyof IHardwareProvider,
    args: any[],
  ): Promise<any> {
    const device = await this.prisma.eQPEquipamento.findUnique({
      where: { EQPCodigo: equipmentId },
    });

    if (!device) throw new Error(`Equipment ${equipmentId} not found`);

    const provider = await this.instantiate(device);

    if (typeof provider[method] !== 'function') {
      throw new Error(
        `Method ${method} not implemented for ${device.EQPMarca}`,
      );
    }

    return await (provider[method] as any)(...args);
  }

  async testConnection(input: {
    INSInstituicaoCodigo: number;
    EQPMarca: string;
    EQPModelo?: string | null;
    EQPUsaAddon?: boolean;
    EQPConfig?: any;
    ip: string;
  }): Promise<{
    ok: boolean;
    deviceId?: string;
    info?: Record<string, unknown>;
    error?: string;
  }> {
    const fakeEquipment = {
      EQPCodigo: 0,
      EQPDescricao: null,
      EQPMarca: input.EQPMarca,
      EQPModelo: input.EQPModelo ?? null,
      EQPEnderecoIp: input.ip,
      deviceId: null,
      EQPConfig: input.EQPConfig ?? {},
      EQPUltimoSincronismo: null,
      EQPUsaAddon: input.EQPUsaAddon ?? false,
      EQPAtivo: true,
      INSInstituicaoCodigo: input.INSInstituicaoCodigo,
      createdAt: new Date(),
    } as unknown as EQPEquipamento;

    try {
      const provider = await this.hardwareFactory.resolve(
        fakeEquipment,
        input.ip,
      );
      return await provider.testConnection();
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Falha desconhecida' };
    }
  }
}
