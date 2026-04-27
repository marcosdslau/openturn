import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { HardwareUser } from '../../../interfaces/hardware.types';
import { IHardwareProvider } from '../../../interfaces/hardware-provider.interface';
import { ControlIDConfig } from '../controlid.types';
import { IHttpTransport } from '../../../transport/http-transport.interface';

export abstract class AbstractControlIDProvider implements IHardwareProvider {
  protected readonly logger = new Logger(AbstractControlIDProvider.name);
  protected session: string | null = null;

  constructor(
    protected readonly config: ControlIDConfig,
    protected readonly prisma: PrismaService,
    protected readonly transport: IHttpTransport,
  ) {}

  private getErrorDetails(error: any): string {
    if (error?.message) return error.message;
    if (error?.code) return error.code;
    if (error?.response?.data?.error_msg) return error.response.data.error_msg;
    return error?.message || 'Unknown error';
  }

  protected async withRetry<T>(
    fn: () => Promise<T>,
    attempts = 5,
    delay = 2000,
  ): Promise<T> {
    let lastError: any;

    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const message = this.getErrorDetails(error);

        const isRetryable =
          message === 'Invalid session' ||
          message === 'write ECONNABORTED' ||
          message === 'read ECONNRESET' ||
          message === 'socket hang up' ||
          (error.response?.status === 401 && i < attempts - 1);

        if (isRetryable && i < attempts - 1) {
          this.logger.warn(
            `Attempt ${i + 1}/${attempts} failed with '${message}'. Retrying in ${delay}ms...`,
          );

          if (message === 'Invalid session' || error.response?.status === 401) {
            this.session = null;
          }

          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }
    throw lastError;
  }

  private async login() {
    return this.withRetry(async () => {
      try {
        const response = await this.transport.post('/login.fcgi', {
          login: this.config.user,
          password: this.config.pass,
        });
        this.session = (response.data as any)?.session ?? null;
        if (!this.session) {
          throw new Error('Device login failed: empty session');
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to login to ControlID device at ${this.config.host}`,
          this.getErrorDetails(error),
        );
        throw error;
      }
    });
  }

  protected async ensureSession() {
    if (!this.session) {
      await this.login();
    }
  }

  async syncPerson(
    equipmentId: number,
    person: HardwareUser,
  ): Promise<{ idNoEquipamento: string }> {
    return this.withRetry(async () => {
      await this.ensureSession();

      const mapping = await this.prisma.rls.pESEquipamentoMapeamento.findUnique(
        {
          where: {
            PESCodigo_EQPCodigo: {
              PESCodigo: person.id,
              EQPCodigo: equipmentId,
            },
          },
        },
      );

      const hardwareId = mapping
        ? parseInt(mapping.PEQIdNoEquipamento, 10)
        : person.id;

      const userResponse = await this.transport.post(
        `/load_objects.fcgi?session=${this.session}`,
        {
          object: 'users',
          where: { users: { id: hardwareId } },
        },
      );

      const data = userResponse.data as any;
      const exists = data.users && data.users.length > 0;

      if (exists) {
        await this.modifyPerson(
          equipmentId,
          person.id,
          person.name,
          person.password,
          person.cpf,
          person.limiar,
        );
      } else {
        await this.createPerson(
          equipmentId,
          person.id,
          person.name,
          person.password,
          person.cpf,
          person.limiar,
        );
      }

      if (person.tags) {
        const tagsResponse = await this.transport.post(
          `/load_objects.fcgi?session=${this.session}`,
          {
            object: 'cards',
            where: { cards: { user_id: hardwareId } },
          },
        );

        const tagsData = tagsResponse.data as any;
        const currentTags: any[] = tagsData.cards || [];
        const currentTagValues = currentTags.map((t) => t.value.toString());

        for (const tag of person.tags) {
          if (!currentTagValues.includes(tag)) {
            await this.setTag(hardwareId, tag);
          }
        }

        for (const t of currentTags) {
          if (!person.tags.includes(t.value.toString())) {
            await this.removeTag(t.value.toString());
          }
        }
      }

      if (person.faces && person.faces.length > 0) {
        await this.setFace(
          hardwareId,
          person.faces[0],
          person.faceExtension || 'jpg',
        );
      }
      if (person.fingers) {
        await this.setFingers(hardwareId, person.fingers);
      }

      return { idNoEquipamento: hardwareId.toString() };
    });
  }

  async modifyPerson(
    equipmentId: number,
    id: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
  ): Promise<void> {
    await this.ensureSession();

    const mapping = await this.prisma.rls.pESEquipamentoMapeamento.findUnique({
      where: { PESCodigo_EQPCodigo: { PESCodigo: id, EQPCodigo: equipmentId } },
    });

    const hardwareId = mapping ? parseInt(mapping.PEQIdNoEquipamento, 10) : id;

    await this.transport.post(`/modify_objects.fcgi?session=${this.session}`, {
      object: 'users',
      values: [
        {
          name,
          registration: hardwareId.toString(),
          password: password || undefined,
          salt: cpf || undefined,
        },
      ],
      where: { users: { id: hardwareId } },
    });
  }

  async createPerson(
    equipmentId: number,
    id: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
  ): Promise<void> {
    await this.ensureSession();

    const hardwareId = id;
    await this.prisma.rls.pESEquipamentoMapeamento.upsert({
      where: { PESCodigo_EQPCodigo: { PESCodigo: id, EQPCodigo: equipmentId } },
      update: { PEQIdNoEquipamento: hardwareId.toString() },
      create: {
        PESCodigo: id,
        EQPCodigo: equipmentId,
        PEQIdNoEquipamento: hardwareId.toString(),
      },
    });

    await this.transport.post(`/create_objects.fcgi?session=${this.session}`, {
      object: 'users',
      values: [
        {
          id: hardwareId,
          name,
          registration: hardwareId.toString(),
          password: password || undefined,
          salt: cpf || undefined,
        },
      ],
    });
  }

  async setTag(userId: number, tag: string): Promise<void> {
    await this.ensureSession();
    const val = parseInt(tag, 10);
    await this.transport.post(`/create_objects.fcgi?session=${this.session}`, {
      object: 'cards',
      values: [{ value: val, user_id: userId }],
    });
  }

  async removeTag(tag: string): Promise<void> {
    await this.ensureSession();
    const val = parseInt(tag, 10);
    await this.transport.post(`/destroy_objects.fcgi?session=${this.session}`, {
      object: 'cards',
      where: { cards: { value: val } },
    });
  }

  async setFace(
    userId: number,
    faceBase64: string,
    extension: string,
  ): Promise<void> {
    await this.ensureSession();

    const buffer = Buffer.from(faceBase64, 'base64');
    const timestamp = Math.floor(Date.now() / 1000);

    await this.transport.post(
      `/user_set_image.fcgi?session=${this.session}&user_id=${userId}&match=1&timestamp=${timestamp}`,
      buffer,
      {
        'Content-Type': 'application/octet-stream',
      },
    );
  }

  async removeFace(userId: number): Promise<void> {
    await this.ensureSession();
    await this.transport.post(
      `/user_destroy_image.fcgi?session=${this.session}`,
      {
        user_id: userId,
      },
    );
  }

  async setFingers(userId: number, templates: string[]): Promise<void> {
    await this.ensureSession();
    const values = templates.map((template) => ({
      user_id: userId,
      template,
      timestamp: Math.floor(Date.now() / 1000),
    }));
    await this.transport.post(`/create_objects.fcgi?session=${this.session}`, {
      object: 'templates',
      values,
    });
  }

  async removeFingers(userId: number): Promise<void> {
    await this.ensureSession();
    await this.transport.post(`/destroy_objects.fcgi?session=${this.session}`, {
      object: 'templates',
      where: { templates: { user_id: userId } },
    });
  }

  async setGroups(
    userId: number,
    groupIds: (number | string)[],
  ): Promise<void> {
    await this.ensureSession();
    const values = groupIds.map((gid) => ({
      user_id: userId,
      group_id: typeof gid === 'string' ? parseInt(gid, 10) : gid,
    }));
    await this.transport.post(`/create_objects.fcgi?session=${this.session}`, {
      object: 'user_groups',
      values,
    });
  }

  async removeGroups(
    userId: number,
    groupIds: (number | string)[],
  ): Promise<void> {
    await this.ensureSession();
    for (const gid of groupIds) {
      const id = typeof gid === 'string' ? parseInt(gid, 10) : gid;
      await this.transport.post(
        `/destroy_objects.fcgi?session=${this.session}`,
        {
          object: 'user_groups',
          where: { user_groups: { user_id: userId, group_id: id } },
        },
      );
    }
  }

  async deletePerson(id: number): Promise<void> {
    return this.withRetry(async () => {
      await this.ensureSession();
      await this.deletePersonImpl(id);
    });
  }

  protected async deletePersonImpl(id: number): Promise<void> {
    try {
      await this.transport.post(
        `/destroy_objects.fcgi?session=${this.session}`,
        {
          object: 'users',
          where: { users: { id: id } },
        },
      );
    } catch (error: any) {
      if (
        error.response?.data?.error_msg !== 'Object not found' &&
        !JSON.stringify(error.response?.data || '').includes('not found')
      ) {
        this.logger.warn(`Failed to delete person ${id}: ${error.message}`);
      }
    }
  }

  async executeAction(action: string, params?: any): Promise<void> {
    return this.withRetry(async () => {
      await this.ensureSession();
      await this.executeActionImpl(action, params);
    });
  }

  protected async executeActionImpl(
    action: string,
    params?: any,
  ): Promise<void> {
    await this.transport.post(`/execute_actions.fcgi?session=${this.session}`, {
      actions: [{ action, parameters: params }],
    });
  }

  async enroll(type: 'face' | 'biometry', userId: number): Promise<void> {
    return this.withRetry(async () => {
      await this.ensureSession();
      await this.enrollImpl(type, userId);
    });
  }

  protected async enrollImpl(
    type: 'face' | 'biometry',
    userId: number,
  ): Promise<void> {
    await this.transport.post(`/remote_enroll.fcgi?session=${this.session}`, {
      type: type,
      save: false,
      user_id: userId,
      sync: false,
    });
  }

  async customCommand(cmd: string, params?: any): Promise<any> {
    return this.withRetry(async () => {
      await this.ensureSession();
      return this.customCommandImpl(cmd, params);
    });
  }

  protected async customCommandImpl(cmd: string, params?: any): Promise<any> {
    switch (cmd) {
      case 'load_objects':
        return (
          await this.transport.post(
            `/load_objects.fcgi?session=${this.session}`,
            { ...params },
          )
        ).data;
      case 'create_objects':
        return (
          await this.transport.post(
            `/create_objects.fcgi?session=${this.session}`,
            { ...params },
          )
        ).data;
      case 'modify_objects':
        return (
          await this.transport.post(
            `/modify_objects.fcgi?session=${this.session}`,
            { ...params },
          )
        ).data;
      case 'destroy_objects':
        return (
          await this.transport.post(
            `/destroy_objects.fcgi?session=${this.session}`,
            { ...params },
          )
        ).data;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  }

  async testConnection(): Promise<{
    ok: boolean;
    deviceId?: string;
    info?: Record<string, unknown>;
    error?: string;
  }> {
    try {
      return await this.withRetry(async () => {
        this.session = null;
        await this.ensureSession();
        if (!this.session) {
          throw new Error('Falha no login (sessão vazia)');
        }

        const response = await this.transport.post(
          `/system_information.fcgi?session=${this.session}`,
          {},
        );
        const info = (response.data || {}) as Record<string, unknown>;
        const deviceId =
          typeof info.device_id === 'string' || typeof info.device_id === 'number'
            ? String(info.device_id)
            : undefined;

        return { ok: true, deviceId, info };
      });
    } catch (error: any) {
      return { ok: false, error: this.getErrorDetails(error) };
    }
  }
}
