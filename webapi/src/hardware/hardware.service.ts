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
  ROTRotina,
  StatusExecucao,
  TipoRotina,
} from '@prisma/client';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';
import { RotinaJobData } from '../rotina/queue/rotina-job.dto';
import { IHardwareProvider } from './interfaces/hardware-provider.interface';
import { HardwareEquipmentConfigType, HardwareUser } from './interfaces/hardware.types';
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

  private async buildHardwareUser(
    person: PESPessoa,
    equipmentId: number,
  ): Promise<HardwareUser> {
    let fingers: string[] = [];
    if (person.PESTemplates && Array.isArray(person.PESTemplates)) {
      fingers = person.PESTemplates as string[];
    }

    const mapping =
      await this.prisma.rls.pESEquipamentoMapeamento.findUnique({
        where: {
          PESCodigo_EQPCodigo: {
            PESCodigo: person.PESCodigo,
            EQPCodigo: equipmentId,
          },
        },
      });

    const idNoEquipamento = HardwareService.deviceUserIdFromPessoa(person);

    return {
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
      fingers,
    };
  }

  /**
   * Sincroniza uma ou mais pessoas em todos os equipamentos ativos da instituição (sync físico).
   * Falhas por equipamento/pessoa não interrompem os demais.
   */
  async syncPerson(
    instituicaoCodigo: number,
    pescodigos: number[],
  ): Promise<{
    results: Array<{
      equipmentId: number;
      pescodigo: number;
      ok: boolean;
      error?: string;
    }>;
    synced: number;
    failed: number;
  }> {
    if (!pescodigos.length) {
      return { results: [], synced: 0, failed: 0 };
    }

    const persons = await this.prisma.pESPessoa.findMany({
      where: {
        PESCodigo: { in: pescodigos },
        INSInstituicaoCodigo: instituicaoCodigo,
        PESAtivo: true,
      },
    });

    if (!persons.length) {
      return { results: [], synced: 0, failed: 0 };
    }

    const devices = await this.prisma.eQPEquipamento.findMany({
      where: { INSInstituicaoCodigo: instituicaoCodigo, EQPAtivo: true },
    });

    const results: Array<{
      equipmentId: number;
      pescodigo: number;
      ok: boolean;
      error?: string;
    }> = [];
    let synced = 0;
    let failed = 0;

    for (const dev of devices) {
      let provider: IHardwareProvider;
      try {
        provider = await this.instantiate(dev);
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        this.logger.warn(
          `[${instituicaoCodigo}] syncPerson instanciar EQP=${dev.EQPCodigo}: ${msg}`,
        );
        for (const person of persons) {
          results.push({
            equipmentId: dev.EQPCodigo,
            pescodigo: person.PESCodigo,
            ok: false,
            error: msg,
          });
          failed++;
        }
        continue;
      }

      for (const person of persons) {
        try {
          const hardwareUser = await this.buildHardwareUser(
            person,
            dev.EQPCodigo,
          );
          await provider.syncPerson(dev.EQPCodigo, hardwareUser);
          results.push({
            equipmentId: dev.EQPCodigo,
            pescodigo: person.PESCodigo,
            ok: true,
          });
          synced++;
        } catch (e) {
          const msg = (e as Error)?.message ?? String(e);
          this.logger.warn(
            `[${instituicaoCodigo}] syncPerson PESCodigo=${person.PESCodigo} EQP=${dev.EQPCodigo}: ${msg}`,
          );
          results.push({
            equipmentId: dev.EQPCodigo,
            pescodigo: person.PESCodigo,
            ok: false,
            error: msg,
          });
          failed++;
        }
      }
    }

    return { results, synced, failed };
  }

  /**
   * Sincroniza uma pessoa em todos os equipamentos ativos da instituição (sync físico).
   * Falhas por equipamento não interrompem os demais.
   */
  async syncPersonAcrossInstitution(
    instituicaoCodigo: number,
    pescodigo: number,
  ): Promise<{
    results: Array<{ equipmentId: number; ok: boolean; error?: string }>;
    synced: number;
    failed: number;
  }> {
    const person = await this.prisma.pESPessoa.findFirst({
      where: {
        PESCodigo: pescodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
        PESAtivo: true,
      },
    });

    if (!person) {
      throw new NotFoundException(
        `Pessoa ${pescodigo} não encontrada ou inativa para esta instituição`,
      );
    }

    const batch = await this.syncPerson(instituicaoCodigo, [pescodigo]);
    return {
      results: batch.results.map(({ equipmentId, ok, error }) => ({
        equipmentId,
        ok,
        error,
      })),
      synced: batch.synced,
      failed: batch.failed,
    };
  }

  /**
   * Remove a pessoa de todos os equipamentos ativos da instituição e, ao fim,
   * apaga mapeamentos locais dessa pessoa para esses equipamentos.
   */
  async deletePersonAcrossInstitution(
    instituicaoCodigo: number,
    pescodigo: number,
  ): Promise<{
    results: Array<{ equipmentId: number; ok: boolean; error?: string }>;
    deleted: number;
    failed: number;
    mappingsRemoved: number;
  }> {
    const person = await this.prisma.pESPessoa.findFirst({
      where: {
        PESCodigo: pescodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
        PESAtivo: true,
      },
    });

    if (!person) {
      throw new NotFoundException(
        `Pessoa ${pescodigo} não encontrada ou inativa para esta instituição`,
      );
    }

    const devices = await this.prisma.eQPEquipamento.findMany({
      where: { INSInstituicaoCodigo: instituicaoCodigo, EQPAtivo: true },
    });

    const equipmentIds = devices.map((d) => d.EQPCodigo);

    const results: Array<{
      equipmentId: number;
      ok: boolean;
      error?: string;
    }> = [];
    let deleted = 0;
    let failed = 0;

    for (const dev of devices) {
      try {
        const provider = await this.instantiate(dev);
        const hardwareUser = await this.buildHardwareUser(
          person,
          dev.EQPCodigo,
        );
        if (
          !Number.isFinite(hardwareUser.id) ||
          Number.isNaN(hardwareUser.id)
        ) {
          throw new Error(
            `ID no equipamento inválido para EQP ${dev.EQPCodigo}`,
          );
        }
        await provider.deletePerson(hardwareUser.id);
        results.push({ equipmentId: dev.EQPCodigo, ok: true });
        deleted++;
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        this.logger.warn(
          `[${instituicaoCodigo}] deletePerson PESCodigo=${pescodigo} EQP=${dev.EQPCodigo}: ${msg}`,
        );
        results.push({ equipmentId: dev.EQPCodigo, ok: false, error: msg });
        failed++;
      }
    }

    const delMaps =
      equipmentIds.length > 0
        ? await this.prisma.rls.pESEquipamentoMapeamento.deleteMany({
            where: {
              PESCodigo: pescodigo,
              EQPCodigo: { in: equipmentIds },
            },
          })
        : { count: 0 };

    return {
      results,
      deleted,
      failed,
      mappingsRemoved: delMaps.count,
    };
  }

  private static readonly WEBHOOK_PUBLISH_MAX_TENTATIVAS = 3;
  private static readonly WEBHOOK_PUBLISH_BACKOFF_MS = [200, 500, 1000];
  private static readonly WEBHOOK_PESSOA_MAX_TENTATIVAS = 3;
  private static readonly WEBHOOK_PESSOA_BACKOFF_MS = [500, 1500, 3000];

  private async resolvePessoaWebhookRotina(instituicaoCodigo: number): Promise<
    | { kind: 'ready'; rotina: ROTRotina; path: string; method: HttpMetodo }
    | { kind: 'invalid'; rotinaPessoasCodigo: number }
    | { kind: 'missing' }
  > {
    const inst = await this.prisma.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoCodigo },
      select: { INSRotinaPessoasCodigo: true },
    });
    const rotinaPessoasCodigo = inst?.INSRotinaPessoasCodigo ?? null;
    if (rotinaPessoasCodigo == null) {
      return { kind: 'missing' };
    }

    const rotina = await this.prisma.rOTRotina.findFirst({
      where: {
        ROTCodigo: rotinaPessoasCodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
        ROTTipo: TipoRotina.WEBHOOK,
        ROTAtivo: true,
      },
    });
    const pathRaw = rotina?.ROTWebhookPath?.trim();
    if (rotina && pathRaw && rotina.ROTWebhookMetodo) {
      const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`;
      return { kind: 'ready', rotina, path, method: rotina.ROTWebhookMetodo };
    }

    return { kind: 'invalid', rotinaPessoasCodigo };
  }

  private async enqueuePessoaWebhookSync(
    instituicaoCodigo: number,
    person: Pick<PESPessoa, 'PESCodigo' | 'PESNome'>,
    rotina: ROTRotina,
    path: string,
    method: HttpMetodo,
  ): Promise<boolean> {
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
      pessoaAttempt <= HardwareService.WEBHOOK_PESSOA_MAX_TENTATIVAS;
      pessoaAttempt++
    ) {
      try {
        exeIdComitado = await this.prisma.$transaction(
          async (tx) => {
            const exec = await tx.rOTExecucaoLog.create({
              data: {
                ROTCodigo: rotina.ROTCodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
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
              instituicaoCodigo,
              trigger: 'WEBHOOK',
              requestEnvelope,
              enqueuedAt: new Date().toISOString(),
            };

            let lastError: unknown = null;
            for (
              let attempt = 1;
              attempt <= HardwareService.WEBHOOK_PUBLISH_MAX_TENTATIVAS;
              attempt++
            ) {
              try {
                await this.rotinaQueueService.publishJobWithConfirm(
                  jobData,
                  exec.EXEIdExterno,
                );
                return exec.EXEIdExterno;
              } catch (e) {
                lastError = e;
                this.logger.warn(
                  `[${instituicaoCodigo}] Publicação falhou tentativa ${attempt}/${HardwareService.WEBHOOK_PUBLISH_MAX_TENTATIVAS} ` +
                    `(PESCodigo=${person.PESCodigo}, exeId=${exec.EXEIdExterno}): ${(e as Error)?.message}`,
                );
                if (attempt < HardwareService.WEBHOOK_PUBLISH_MAX_TENTATIVAS) {
                  await new Promise((r) =>
                    setTimeout(
                      r,
                      HardwareService.WEBHOOK_PUBLISH_BACKOFF_MS[attempt - 1],
                    ),
                  );
                }
              }
            }
            throw new Error(
              `Rabbit publish falhou após ${HardwareService.WEBHOOK_PUBLISH_MAX_TENTATIVAS} tentativas: ${(lastError as Error)?.message}`,
            );
          },
          { timeout: 30000, maxWait: 5000 },
        );

        break;
      } catch (e) {
        lastPersonError = e;
        this.logger.warn(
          `[${instituicaoCodigo}] Tentativa ${pessoaAttempt}/${HardwareService.WEBHOOK_PESSOA_MAX_TENTATIVAS} falhou para PESCodigo=${person.PESCodigo}: ${(e as Error)?.message}`,
        );
        if (pessoaAttempt < HardwareService.WEBHOOK_PESSOA_MAX_TENTATIVAS) {
          await new Promise((r) =>
            setTimeout(
              r,
              HardwareService.WEBHOOK_PESSOA_BACKOFF_MS[pessoaAttempt - 1],
            ),
          );
        }
      }
    }

    if (!exeIdComitado) {
      this.logger.error(
        `[${instituicaoCodigo}] Pessoa PESCodigo=${person.PESCodigo} desistida após ${HardwareService.WEBHOOK_PESSOA_MAX_TENTATIVAS} tentativas: ${(lastPersonError as Error)?.message}`,
        lastPersonError,
      );
      return false;
    }

    void this.rotinaQueueService
      .setPendingMarker(exeIdComitado)
      .catch(() => {});

    return true;
  }

  async dispatchPessoaSync(
    instituicaoCodigo: number,
    pescodigo: number,
    envioOnline = false,
  ): Promise<void> {
    const person = await this.prisma.pESPessoa.findFirst({
      where: {
        PESCodigo: pescodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
      },
      select: { PESCodigo: true, PESNome: true, PESAtivo: true },
    });

    if (!person?.PESAtivo) {
      return;
    }

    if (envioOnline) {
      await this.syncPerson(instituicaoCodigo, [pescodigo]);
      return;
    }

    const resolved = await this.resolvePessoaWebhookRotina(instituicaoCodigo);

    if (resolved.kind === 'ready') {
      const enqueued = await this.enqueuePessoaWebhookSync(
        instituicaoCodigo,
        person,
        resolved.rotina,
        resolved.path,
        resolved.method,
      );
      if (enqueued) {
        return;
      }
      return;
    }

    if (resolved.kind === 'invalid') {
      this.logger.warn(
        `[${instituicaoCodigo}] INSRotinaPessoasCodigo=${resolved.rotinaPessoasCodigo} inválido ou inativo; usando sync físico.`,
      );
    }

    await this.syncPersonAcrossInstitution(instituicaoCodigo, pescodigo);
  }

  async syncAll(instituicaoId: number) {
    const people = await this.prisma.pESPessoa.findMany({
      where: { INSInstituicaoCodigo: instituicaoId, PESAtivo: true },
    });

    for (const person of people) {
      await this.dispatchPessoaSync(instituicaoId, person.PESCodigo);
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

  /**
   * Solicita exclusão de todos os usuários no equipamento (delega à marca).
   * Por enquanto os providers abstratos apenas registram log (stub).
   */
  async deleteAllUsers(
    instituicaoCodigo: number,
    equipmentId: number,
  ): Promise<{ ok: boolean }> {
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
    await provider.deleteAllUsers(device.EQPCodigo);
    return { ok: true };
  }

  async openGate(
    instituicaoCodigo: number,
    equipmentId: number,
  ): Promise<{ ok: boolean }> {
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
    await provider.openGate(device.EQPCodigo);
    return { ok: true };
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
