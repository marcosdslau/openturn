import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  EQPEquipamento,
  HttpMetodo,
  PESPessoa,
  StatusExecucao,
  TipoRotina,
} from '@prisma/client';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';
import { RotinaJobData } from '../rotina/queue/rotina-job.dto';
import { IHardwareProvider } from './interfaces/hardware-provider.interface';
import { HardwareEquipmentConfigType } from './interfaces/hardware.types';
import { HardwareFactory } from './factory/hardware.factory';
import { ControlIDConfig } from './brands/controlid/controlid.types';

@Injectable()
export class HardwareService {
  private readonly logger = new Logger(HardwareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hardwareFactory: HardwareFactory,
    private readonly rotinaQueueService: RotinaQueueService,
  ) {}

  /**
   * Id do usuário no leitor quando ainda não existe linha de mapeamento
   * (PESIdExterno numérico, senão PESCodigo).
   */
  static deviceUserIdFromPessoa(person: PESPessoa): number {
    if (person.PESIdExterno != null && String(person.PESIdExterno).trim() !== '') {
      const s = String(person.PESIdExterno).trim();
      const n = Number(s);
      if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
        return n;
      }
      const p = parseInt(s, 10);
      if (!Number.isNaN(p) && p > 0) {
        return p;
      }
    }
    return person.PESCodigo;
  }

  async instantiate(
    equipment: EQPEquipamento,
    overrideHost?: string,
  ): Promise<IHardwareProvider> {
    return this.hardwareFactory.resolve(equipment, overrideHost);
  }

  async syncAll(instituicaoId: number) {
    const inst = await this.prisma.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoId },
      select: { INSRotinaPessoasCodigo: true },
    });
    const rotinaPessoasCodigo = inst?.INSRotinaPessoasCodigo ?? null;

    if (rotinaPessoasCodigo != null) {
      const rotina = await this.prisma.rOTRotina.findFirst({
        where: {
          ROTCodigo: rotinaPessoasCodigo,
          INSInstituicaoCodigo: instituicaoId,
          ROTTipo: TipoRotina.WEBHOOK,
          ROTAtivo: true,
        },
      });
      const pathRaw = rotina?.ROTWebhookPath?.trim();
      if (rotina && pathRaw && rotina.ROTWebhookMetodo) {
        const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`;
        const method = rotina.ROTWebhookMetodo;
        const people = await this.prisma.pESPessoa.findMany({
          where: { INSInstituicaoCodigo: instituicaoId, PESAtivo: true },
        });
        let enfileirados = 0;
        const MAX_TENTATIVAS = 3;
        const BACKOFF_MS = [200, 500, 1000];
        const MAX_TENTATIVAS_PESSOA = 3;
        const BACKOFF_PESSOA_MS = [500, 1500, 3000];

        for (const person of people) {
          const body = {
            PESCodigo: person.PESCodigo,
            PESNome: person.PESNome,
          };
          const query =
            method === HttpMetodo.GET
              ? {
                  PESCodigo: String(person.PESCodigo),
                  PESNome: person.PESNome,
                }
              : {};
          const requestEnvelope = {
            body,
            query,
            headers: {},
            method,
            path,
            params: {},
          };

          let exeIdComitado: string | null = null;
          let lastPersonError: unknown = null;

          for (
            let pessoaAttempt = 1;
            pessoaAttempt <= MAX_TENTATIVAS_PESSOA;
            pessoaAttempt++
          ) {
            try {
              exeIdComitado = await this.prisma.$transaction(
                async (tx) => {
                  const exec = await tx.rOTExecucaoLog.create({
                    data: {
                      ROTCodigo: rotina.ROTCodigo,
                      INSInstituicaoCodigo: instituicaoId,
                      EXEStatus: StatusExecucao.EM_EXECUCAO,
                      EXEInicio: new Date(),
                      EXETrigger: 'WEBHOOK',
                      EXERequestBody: body,
                      EXERequestParams: {},
                      EXERequestPath: path,
                    },
                  });

                  const jobData: RotinaJobData = {
                    exeId: exec.EXEIdExterno,
                    rotinaCodigo: rotina.ROTCodigo,
                    instituicaoCodigo: instituicaoId,
                    trigger: 'WEBHOOK',
                    requestEnvelope,
                    enqueuedAt: new Date().toISOString(),
                  };

                  let lastError: unknown = null;
                  for (let attempt = 1; attempt <= MAX_TENTATIVAS; attempt++) {
                    try {
                      await this.rotinaQueueService.publishJobWithConfirm(
                        jobData,
                        exec.EXEIdExterno,
                      );
                      return exec.EXEIdExterno;
                    } catch (e) {
                      lastError = e;
                      this.logger.warn(
                        `[${instituicaoId}] Publicação falhou tentativa ${attempt}/${MAX_TENTATIVAS} ` +
                          `(PESCodigo=${person.PESCodigo}, exeId=${exec.EXEIdExterno}): ${(e as Error)?.message}`,
                      );
                      if (attempt < MAX_TENTATIVAS) {
                        await new Promise((r) =>
                          setTimeout(r, BACKOFF_MS[attempt - 1]),
                        );
                      }
                    }
                  }
                  throw new Error(
                    `Rabbit publish falhou após ${MAX_TENTATIVAS} tentativas: ${(lastError as Error)?.message}`,
                  );
                },
                { timeout: 30000, maxWait: 5000 },
              );

              enfileirados++;
              break;
            } catch (e) {
              lastPersonError = e;
              this.logger.warn(
                `[${instituicaoId}] Tentativa ${pessoaAttempt}/${MAX_TENTATIVAS_PESSOA} falhou para PESCodigo=${person.PESCodigo}: ${(e as Error)?.message}`,
              );
              if (pessoaAttempt < MAX_TENTATIVAS_PESSOA) {
                await new Promise((r) =>
                  setTimeout(r, BACKOFF_PESSOA_MS[pessoaAttempt - 1]),
                );
              }
            }
          }

          if (!exeIdComitado) {
            this.logger.error(
              `[${instituicaoId}] Pessoa PESCodigo=${person.PESCodigo} desistida após ${MAX_TENTATIVAS_PESSOA} tentativas: ${(lastPersonError as Error)?.message}`,
              lastPersonError,
            );
            continue;
          }

          void this.rotinaQueueService
            .setPendingMarker(exeIdComitado)
            .catch(() => {});
        }
        this.logger.log(
          `[${instituicaoId}] Sync pessoas via webhook (rotina=${rotina.ROTCodigo}): ${enfileirados}/${people.length} job(s) enfileirado(s)`,
        );
        return;
      }
      this.logger.warn(
        `[${instituicaoId}] INSRotinaPessoasCodigo=${rotinaPessoasCodigo} inválido ou inativo; usando sync físico.`,
      );
    }

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

          const idNoEquipamento = HardwareService.deviceUserIdFromPessoa(person);

          await provider.syncPerson(dev.EQPCodigo, {
            pescodigo: person.PESCodigo,
            id: mapping
              ? parseInt(mapping.PEQIdNoEquipamento, 10)
              : idNoEquipamento,
            name: person.PESNome,
            cpf: person.PESDocumento || undefined,
            faceExtension: person.PESFotoExtensao || 'jpg',
            grupo: person.PESGrupo ?? undefined,
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

  async applyEquipmentConfiguration(
    instituicaoCodigo: number,
    equipmentId: number,
    type: HardwareEquipmentConfigType,
  ): Promise<unknown> {
    if (!Object.values(HardwareEquipmentConfigType).includes(type)) {
      throw new BadRequestException(`Tipo de configuração inválido: ${type}`);
    }

    const device = await this.prisma.eQPEquipamento.findUnique({
      where: { EQPCodigo: equipmentId },
    });

    if (!device) {
      throw new NotFoundException(`Equipamento ${equipmentId} não encontrado`);
    }

    if (device.INSInstituicaoCodigo !== instituicaoCodigo) {
      throw new NotFoundException(`Equipamento ${equipmentId} não encontrado`);
    }

    const provider = await this.instantiate(device);
    return provider.applyEquipmentConfiguration(device, type);
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
