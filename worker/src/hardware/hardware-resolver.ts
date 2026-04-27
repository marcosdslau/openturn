import type { PrismaClient } from '@prisma/client';
import type { IHardwareProvider } from './interfaces/hardware-provider.interface';
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
