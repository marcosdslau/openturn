import type { PrismaClient, PESPessoa } from '@prisma/client';
import type { IHardwareProvider } from './interfaces/hardware-provider.interface';
import type { HardwareUser } from './interfaces/hardware.types';
import type { HardwareFactory } from './factory/hardware.factory';

const ALLOWED_PROVIDER_METHODS = new Set<keyof IHardwareProvider>([
  'syncPerson',
  'createPerson',
  'modifyPerson',
  'deletePerson',
  'setTag',
  'removeTag',
  'setFace',
  'removeFace',
  'setFingers',
  'removeFingers',
  'setGroups',
  'removeGroups',
  'executeAction',
  'enroll',
  'customCommand',
  'testConnection',
  'applyEquipmentConfiguration',
]);

/** O proxy da rotina envia só o restante após `eqpId`; estes métodos exigem `equipmentId` explícito no provider. */
const METHODS_WITH_LEADING_EQUIPMENT_ID: Set<string> = new Set([
  'syncPerson',
  'createPerson',
  'modifyPerson',
]);

export class HardwareResolver {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly factory: HardwareFactory,
    private readonly instituicaoCodigo: number,
  ) {}

  /**
   * Id do usuário no leitor quando ainda não existe linha de mapeamento
   * (PESIdExterno numérico, senão PESCodigo).
   */
  static deviceUserIdFromPessoa(person: PESPessoa): number {
    if (
      person.PESIdExterno != null &&
      String(person.PESIdExterno).trim() !== ''
    ) {
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

  private async buildHardwareUser(
    person: PESPessoa,
    equipmentId: number,
  ): Promise<HardwareUser> {
    let fingers: string[] = [];
    if (person.PESTemplates && Array.isArray(person.PESTemplates)) {
      fingers = person.PESTemplates as string[];
    }

    const mapping =
      await this.prisma.pESEquipamentoMapeamento.findUnique({
        where: {
          PESCodigo_EQPCodigo: {
            PESCodigo: person.PESCodigo,
            EQPCodigo: equipmentId,
          },
        },
      });

    const idNoEquipamento = HardwareResolver.deviceUserIdFromPessoa(person);

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
   * Remove a pessoa de todos os equipamentos ativos da instituição e, ao fim,
   * apaga mapeamentos locais dessa pessoa para esses equipamentos.
   */
  async deletePersonAcrossInstitution(pescodigo: number): Promise<{
    results: Array<{ equipmentId: number; ok: boolean; error?: string }>;
    deleted: number;
    failed: number;
    mappingsRemoved: number;
  }> {
    const person = await this.prisma.pESPessoa.findFirst({
      where: {
        PESCodigo: pescodigo,
        INSInstituicaoCodigo: this.instituicaoCodigo,
        PESAtivo: true,
      },
    });

    if (!person) {
      throw new Error(
        `Pessoa ${pescodigo} não encontrada ou inativa para esta instituição`,
      );
    }

    const devices = await this.prisma.eQPEquipamento.findMany({
      where: {
        INSInstituicaoCodigo: this.instituicaoCodigo,
        EQPAtivo: true,
      },
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
        const provider = await this.factory.resolve(dev);
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
        results.push({ equipmentId: dev.EQPCodigo, ok: false, error: msg });
        failed++;
      }
    }

    const delMaps =
      equipmentIds.length > 0
        ? await this.prisma.pESEquipamentoMapeamento.deleteMany({
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

  async exec(
    equipmentId: number,
    method: string,
    args: unknown[],
  ): Promise<unknown> {
    if (!ALLOWED_PROVIDER_METHODS.has(method as keyof IHardwareProvider)) {
      throw new Error(`Method ${method} is not allowed on hardware provider`);
    }

    const device = await this.prisma.eQPEquipamento.findFirst({
      where: {
        EQPCodigo: equipmentId,
        INSInstituicaoCodigo: this.instituicaoCodigo,
      },
    });

    if (!device) {
      throw new Error(
        `Equipment ${equipmentId} not found in tenant ${this.instituicaoCodigo}`,
      );
    }

    const provider = await this.factory.resolve(device);

    const fn = (provider as unknown as Record<string, unknown>)[method];
    if (typeof fn !== 'function') {
      throw new Error(
        `Method ${method} not implemented for ${device.EQPMarca ?? 'unknown brand'}`,
      );
    }

    if (METHODS_WITH_LEADING_EQUIPMENT_ID.has(method)) {
      return await (fn as (...a: unknown[]) => Promise<unknown>).call(
        provider,
        equipmentId,
        ...args,
      );
    }

    return await (fn as (...a: unknown[]) => Promise<unknown>).apply(
      provider,
      args,
    );
  }
}
