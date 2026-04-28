import { BadRequestException, Logger } from '@nestjs/common';
import { EQPEquipamento } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  HardwareEquipmentConfigType,
  HardwareUser,
} from '../../../interfaces/hardware.types';
import { IHardwareProvider } from '../../../interfaces/hardware-provider.interface';
import {
  ControlIDConfig,
  ControlIdRelayMultiHostContext,
} from '../controlid.types';
import { IHttpTransport } from '../../../transport/http-transport.interface';
import { DirectHttpTransport } from '../../../transport/direct-http.transport';
import { WsRelayHttpTransport } from '../../../transport/ws-relay-http.transport';

/** Trecho de `INSInstituicao.INSConfigHardware` usado para Monitor Control iD. */
type InsConfigHardwareMonitorJson = {
  controlid?: {
    monitor?: {
      ip?: string;
      port?: number | string;
      path?: string;
    };
  };
};

export abstract class AbstractControlIDProvider implements IHardwareProvider {
  protected readonly logger = new Logger(AbstractControlIDProvider.name);
  protected session: string | null = null;

  constructor(
    protected readonly config: ControlIDConfig,
    protected readonly prisma: PrismaService,
    protected readonly transport: IHttpTransport,
    protected readonly relayMultiHost?: ControlIdRelayMultiHostContext,
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

  /** POST com `withRetry` + `ensureSession`; path sem query — acrescenta `?session=` após obter sessão. */
  private async postWithRetry(
    fcgiPath: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ data: unknown }> {
    return this.withRetry(async () => {
      await this.ensureSession();
      const path = `${fcgiPath}?session=${this.session}`;
      return await this.transport.post(path, body, headers);
    });
  }

  async syncPerson(
    equipmentId: number,
    person: HardwareUser,
  ): Promise<{ idNoEquipamento: string }> {
    await this.ensureSession();

    const mapping = await this.prisma.rls.pESEquipamentoMapeamento.findUnique(
      {
        where: {
          PESCodigo_EQPCodigo: {
            PESCodigo: person.pescodigo,
            EQPCodigo: equipmentId,
          },
        },
      },
    );

    const hardwareId = mapping
      ? parseInt(mapping.PEQIdNoEquipamento, 10)
      : person.id;

    const userResponse = await this.withRetry(async () => {
      await this.ensureSession();
      return await this.transport.post(
        `/load_objects.fcgi?session=${this.session}`,
        {
          object: 'users',
          where: { users: { id: hardwareId } },
        },
      );
    });

    const data = userResponse.data as any;
    const exists = data.users && data.users.length > 0;

    if (exists && !mapping) {
      await this.prisma.rls.pESEquipamentoMapeamento.upsert({
        where: {
          PESCodigo_EQPCodigo: {
            PESCodigo: person.pescodigo,
            EQPCodigo: equipmentId,
          },
        },
        create: {
          PESCodigo: person.pescodigo,
          EQPCodigo: equipmentId,
          PEQIdNoEquipamento: hardwareId.toString(),
        },
        update: { PEQIdNoEquipamento: hardwareId.toString() },
      });
    }

    if (exists) {
      await this.modifyPerson(
        equipmentId,
        person.pescodigo,
        person.name,
        person.password,
        person.cpf,
        person.limiar,
        person.grupo,
      );
    } else {
      await this.createPerson(
        equipmentId,
        person.pescodigo,
        person.id,
        person.name,
        person.password,
        person.cpf,
        person.limiar,
        person.grupo,
      );
    }

    if (person.tags) {
      const tagsResponse = await this.withRetry(async () => {
        await this.ensureSession();
        return await this.transport.post(
          `/load_objects.fcgi?session=${this.session}`,
          {
            object: 'cards',
            where: { cards: { user_id: hardwareId } },
          },
        );
      });

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
    if (person.fingers?.length) {
      await this.setFingers(hardwareId, person.fingers);
    }

    return { idNoEquipamento: hardwareId.toString() };
  }

  /**
   * Sincroniza vínculos `user_groups` no Control iD com PESGrupo: busca `groups` no equipamento,
   * encontra por nome (case-insensitive) ou por id numérico, e alinha os vínculos do usuário.
   */
  protected async syncUserGroupsFromDepartamento(
    hardwareId: number,
    grupo: string | null | undefined,
  ): Promise<void> {
    try {
      const groupsRes = await this.postWithRetry('/load_objects.fcgi', {
        object: 'groups',
      });
      const groups: any[] = (groupsRes.data as any)?.groups ?? [];

      const ugRes = await this.postWithRetry('/load_objects.fcgi', {
        object: 'user_groups',
        where: { user_groups: { user_id: hardwareId } },
      });
      const currentLinks: any[] = (ugRes.data as any)?.user_groups ?? [];
      const currentGroupIds = currentLinks.map((ug) => Number(ug.group_id));

      const label = (grupo ?? '').trim();
      const norm = (s: string) => s.trim().toLowerCase();

      if (!label) {
        for (const gid of currentGroupIds) {
          await this.postWithRetry('/destroy_objects.fcgi', {
            object: 'user_groups',
            where: {
              user_groups: { user_id: hardwareId, group_id: gid },
            },
          });
        }
        return;
      }

      const target = groups.find((g) => {
        if (g?.name != null && norm(String(g.name)) === norm(label)) {
          return true;
        }
        if (g?.id != null && String(g.id) === label) {
          return true;
        }
        return false;
      });

      if (target == null || target.id == null) {
        const names = groups
          .map((g) => g?.name)
          .filter((n) => n != null && String(n).length > 0)
          .join(', ');
        this.logger.warn(
          `Departamento/grupo "${label}" não encontrado no equipamento (${this.config.host}). Grupos cadastrados: ${names || '(nenhum)'}`,
        );
        return;
      }

      const targetId = Number(target.id);

      for (const gid of currentGroupIds) {
        if (gid !== targetId) {
          await this.postWithRetry('/destroy_objects.fcgi', {
            object: 'user_groups',
            where: {
              user_groups: { user_id: hardwareId, group_id: gid },
            },
          });
        }
      }

      if (!currentGroupIds.some((gid) => gid === targetId)) {
        await this.postWithRetry('/create_objects.fcgi', {
          object: 'user_groups',
          values: [{ user_id: hardwareId, group_id: targetId }],
        });
      }
    } catch (error: any) {
      this.logger.warn(
        `Falha ao sincronizar departamento (PESGrupo) para usuário ${hardwareId}: ${this.getErrorDetails(error)}`,
      );
    }
  }

  async modifyPerson(
    equipmentId: number,
    pescodigo: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
    grupo?: string,
  ): Promise<void> {
    const mapping = await this.prisma.rls.pESEquipamentoMapeamento.findUnique({
      where: {
        PESCodigo_EQPCodigo: { PESCodigo: pescodigo, EQPCodigo: equipmentId },
      },
    });

    if (!mapping) {
      throw new Error(
        `Mapeamento não encontrado para PESCodigo ${pescodigo} no equipamento ${equipmentId}`,
      );
    }

    const hardwareId = parseInt(mapping.PEQIdNoEquipamento, 10);

    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(`/modify_objects.fcgi?session=${this.session}`, {
        object: 'users',
        values: {
          name,
          registration: hardwareId.toString(),
          password: password || undefined,
          salt: cpf || undefined,
        },
        where: { users: { id: hardwareId } },
      });
    });

    await this.syncUserGroupsFromDepartamento(hardwareId, grupo);
  }

  async createPerson(
    equipmentId: number,
    pescodigo: number,
    id: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
    grupo?: string,
  ): Promise<void> {
    const hardwareId = id;
    await this.prisma.rls.pESEquipamentoMapeamento.upsert({
      where: {
        PESCodigo_EQPCodigo: { PESCodigo: pescodigo, EQPCodigo: equipmentId },
      },
      update: { PEQIdNoEquipamento: hardwareId.toString() },
      create: {
        PESCodigo: pescodigo,
        EQPCodigo: equipmentId,
        PEQIdNoEquipamento: hardwareId.toString(),
      },
    });

    await this.withRetry(async () => {
      await this.ensureSession();
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
    });

    await this.syncUserGroupsFromDepartamento(hardwareId, grupo);
  }

  async setTag(userId: number, tag: string): Promise<void> {
    const val = parseInt(tag, 10);
    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(`/create_objects.fcgi?session=${this.session}`, {
        object: 'cards',
        values: [{ value: val, user_id: userId }],
      });
    });
  }

  async removeTag(tag: string): Promise<void> {
    const val = parseInt(tag, 10);
    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(`/destroy_objects.fcgi?session=${this.session}`, {
        object: 'cards',
        where: { cards: { value: val } },
      });
    });
  }

  async setFace(
    userId: number,
    faceBase64: string,
    extension: string,
  ): Promise<void> {
    const buffer = Buffer.from(faceBase64, 'base64');
    const timestamp = Math.floor(Date.now() / 1000);

    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(
        `/user_set_image.fcgi?session=${this.session}&user_id=${userId}&match=1&timestamp=${timestamp}`,
        buffer,
        {
          'Content-Type': 'application/octet-stream',
        },
      );
    });
  }

  async removeFace(userId: number): Promise<void> {
    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(
        `/user_destroy_image.fcgi?session=${this.session}`,
        {
          user_id: userId,
        },
      );
    });
  }

  async setFingers(userId: number, templates: string[]): Promise<void> {
    const values = templates.map((template) => ({
      user_id: userId,
      template,
      timestamp: Math.floor(Date.now() / 1000),
    }));
    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(`/create_objects.fcgi?session=${this.session}`, {
        object: 'templates',
        values,
      });
    });
  }

  async removeFingers(userId: number): Promise<void> {
    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(`/destroy_objects.fcgi?session=${this.session}`, {
        object: 'templates',
        where: { templates: { user_id: userId } },
      });
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
    await this.withRetry(async () => {
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
    });
  }

  async deletePerson(id: number): Promise<void> {
    await this.deletePersonImpl(id);
  }

  protected async deletePersonImpl(id: number): Promise<void> {
    try {
      await this.withRetry(async () => {
        await this.ensureSession();
        await this.transport.post(
          `/destroy_objects.fcgi?session=${this.session}`,
          {
            object: 'users',
            where: { users: { id: id } },
          },
        );
      });
    } catch (error: any) {
      if (
        error.response?.data?.error_msg !== 'Object not found' &&
        !JSON.stringify(error.response?.data || '').includes('not found')
      ) {
        this.logger.warn(`Failed to delete person ${id}: ${error.message}`);
      }
    }
  }

  async deleteAllUsers(equipmentId: number): Promise<void> {
    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(
        `/destroy_objects.fcgi?session=${this.session}`,
        { object: 'users' },
      );
    });

    const removed = await this.prisma.rls.pESEquipamentoMapeamento.deleteMany({
      where: { EQPCodigo: equipmentId },
    });

    this.logger.log(
      `[ControlID] deleteAllUsers equipmentId=${equipmentId}: usuários removidos no equipamento; ` +
        `${removed.count} mapeamento(s) PESEquipamentoMapeamento apagado(s).`,
    );
  }

  async executeAction(action: string, params?: any): Promise<void> {
    await this.executeActionImpl(action, params);
  }

  protected async executeActionImpl(
    action: string,
    params?: any,
  ): Promise<void> {
    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(`/execute_actions.fcgi?session=${this.session}`, {
        actions: [{ action, parameters: params }],
      });
    });
  }

  async enroll(type: 'face' | 'biometry', userId: number): Promise<void> {
    await this.enrollImpl(type, userId);
  }

  protected async enrollImpl(
    type: 'face' | 'biometry',
    userId: number,
  ): Promise<void> {
    await this.withRetry(async () => {
      await this.ensureSession();
      await this.transport.post(`/remote_enroll.fcgi?session=${this.session}`, {
        type: type,
        save: false,
        user_id: userId,
        sync: false,
      });
    });
  }

  /** 0 = horário (clockwise), 1 = anti-horário (counter_clockwise) — alinhado ao cadastro do equipamento. */
  private resolveCatraSideToEnter(device: EQPEquipamento): '0' | '1' {
    const cfg = (device.EQPConfig || {}) as unknown as ControlIDConfig;
    if (cfg.entry_direction === 'counter_clockwise') return '1';
    if (cfg.entry_direction === 'clockwise') return '0';
    if (cfg.entry_side === 'left') return '1';
    if (cfg.entry_side === 'right') return '0';
    return '0';
  }

  /** Remove protocolo e path; devolve host com porta se vier no cadastro (ex.: `192.168.1.1:55580`). */
  private parseHostSpec(raw: string): {
    protocol: string;
    hostWithOptionalPort: string;
  } {
    let s = raw.trim();
    let protocol = 'http';
    if (s.includes('://')) {
      const idx = s.indexOf('://');
      protocol = s.slice(0, idx).toLowerCase() || 'http';
      s = s.slice(idx + 3);
    }
    s = (s.split('/')[0] ?? s).trim();
    return { protocol, hostWithOptionalPort: s };
  }

  /**
   * Chave para deduplicar / comparar endpoint (host + porta explícita ou porta default de `config`).
   * Evita fundir `187.94.98.90:55580` com `187.94.98.90:55581`.
   */
  private monitorEndpointKey(hostRaw: string | null | undefined): string {
    if (hostRaw == null) return '';
    const { hostWithOptionalPort } = this.parseHostSpec(String(hostRaw));
    const h = hostWithOptionalPort.toLowerCase();
    if (!h) return '';
    const defaultPort = this.config.port ?? 80;

    const ipv4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/.exec(h);
    if (ipv4) {
      const ip = ipv4[1];
      const p = ipv4[2];
      return p !== undefined ? `${ip}:${p}` : `${ip}:${defaultPort}`;
    }

    if (h.startsWith('[')) {
      const close = h.indexOf(']');
      if (close > 0) {
        const addr = h.slice(0, close + 1).toLowerCase();
        const rest = h.slice(close + 1);
        if (rest.startsWith(':') && /^\d{1,5}$/.test(rest.slice(1))) {
          return `${addr}:${rest.slice(1)}`;
        }
        return `${addr}:${defaultPort}`;
      }
    }

    const lastColon = h.lastIndexOf(':');
    if (lastColon > 0 && /^\d{1,5}$/.test(h.slice(lastColon + 1))) {
      return h;
    }

    return `${h}:${defaultPort}`;
  }

  /**
   * BOX (`sec_box`) só no equipamento primário: cadastro com IP principal e Device ID,
   * e sessão HTTP apontando para esse IP (não leitor entrada/saída).
   */
  private assertBoxConfigOnPrimaryDevice(device: EQPEquipamento): void {
    const ip = (device.EQPEnderecoIp ?? '').trim();
    const devId = (device.deviceId ?? '').trim();
    if (!ip) {
      throw new BadRequestException(
        'Configuração BOX só se aplica ao equipamento primário: informe o endereço IP principal (EQPEnderecoIp).',
      );
    }
    if (!devId) {
      throw new BadRequestException(
        'Configuração BOX só se aplica ao equipamento primário: informe o Device ID do Monitor (EQPDeviceId).',
      );
    }
    const sessionHost = this.monitorEndpointKey(this.config.host);
    const primaryHost = this.monitorEndpointKey(device.EQPEnderecoIp);
    if (!sessionHost || sessionHost !== primaryHost) {
      throw new BadRequestException(
        `Configuração BOX deve ser enviada ao host primário do cadastro (${ip}). A conexão atual não corresponde a esse IP (ex.: leitor facial secundário).`,
      );
    }
  }

  private configGeral(device: EQPEquipamento): unknown {
    console.log(
      `[ControlID] configGeral equipamento=${device.EQPCodigo} inst=${device.INSInstituicaoCodigo}`,
    );
    this.logger.log(`[ControlID] configGeral EQP=${device.EQPCodigo}`);
    return { applied: true, type: HardwareEquipmentConfigType.GERAL };
  }

  private async configBox(device: EQPEquipamento): Promise<unknown> {
    this.assertBoxConfigOnPrimaryDevice(device);
    const catra_side_to_enter = this.resolveCatraSideToEnter(device);
    const payload = {
      sec_box: {
        catra_role: '1',
        catra_default_fsm: '0',
        catra_side_to_enter,
      },
    };
    const res = await this.postWithRetry('/set_configuration.fcgi', payload);
    return {
      applied: true,
      type: HardwareEquipmentConfigType.BOX,
      sec_box: payload.sec_box,
      response: res.data,
    };
  }

  /** IPs distintos: principal, entrada e saída (faciais), para aplicar `monitor` em cada aparelho. */
  private collectMonitorTargetHosts(device: EQPEquipamento): string[] {
    const cfg = (device.EQPConfig || {}) as unknown as ControlIDConfig;
    const candidates: string[] = [];
    const add = (s: string | null | undefined) => {
      const t = (s ?? '').trim();
      if (t) candidates.push(t);
    };
    add(device.EQPEnderecoIp);
    add(cfg.ip_entry);
    add(cfg.ip_exit);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of candidates) {
      const key = this.monitorEndpointKey(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(raw);
    }
    return out;
  }

  private buildBaseUrlForHost(hostRaw: string): string {
    const { protocol, hostWithOptionalPort } = this.parseHostSpec(hostRaw);
    const host = hostWithOptionalPort;
    const defaultPort = this.config.port ?? 80;

    const ipv4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/.exec(
      host.toLowerCase(),
    );
    if (ipv4) {
      const ip = ipv4[1];
      const explicit = ipv4[2];
      const portNum = explicit !== undefined ? explicit : String(defaultPort);
      return `${protocol}://${ip}:${portNum}`;
    }

    if (host.startsWith('[')) {
      const close = host.indexOf(']');
      if (close > 0) {
        const addr = host.slice(0, close + 1);
        const rest = host.slice(close + 1);
        if (rest.startsWith(':') && /^\d{1,5}$/.test(rest.slice(1))) {
          return `${protocol}://${addr}${rest}`;
        }
        return `${protocol}://${addr}:${defaultPort}`;
      }
    }

    const lastColon = host.lastIndexOf(':');
    if (lastColon > 0 && /^\d{1,5}$/.test(host.slice(lastColon + 1))) {
      return `${protocol}://${host}`;
    }

    return `${protocol}://${host}:${defaultPort}`;
  }

  private transportForHost(
    device: EQPEquipamento,
    hostRaw: string,
  ): IHttpTransport {
    const baseURL = this.buildBaseUrlForHost(hostRaw);
    if (device.EQPUsaAddon) {
      if (!this.relayMultiHost) {
        throw new BadRequestException(
          'Equipamento com addon exige contexto relay para configurar o monitor em múltiplos hosts.',
        );
      }
      return new WsRelayHttpTransport(
        this.relayMultiHost.wsRelay,
        this.relayMultiHost.connectorCodigo,
        this.relayMultiHost.equipmentId,
        baseURL,
      );
    }
    return new DirectHttpTransport(baseURL);
  }

  /** Login + set_configuration em um transport isolado (não usa `this.session`). */
  private async sendSetConfigurationOnHost(
    transport: IHttpTransport,
    payload: unknown,
  ): Promise<unknown> {
    let lastError: any;
    const attempts = 5;
    const delay = 2000;
    for (let i = 0; i < attempts; i++) {
      try {
        const loginRes = await transport.post('/login.fcgi', {
          login: this.config.user,
          password: this.config.pass,
        });
        const session = (loginRes.data as any)?.session ?? null;
        if (!session) {
          throw new Error('Device login failed: empty session');
        }
        const res = await transport.post(
          `/set_configuration.fcgi?session=${session}`,
          payload,
        );
        return res.data;
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
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private async configMonitor(device: EQPEquipamento): Promise<unknown> {
    const inst = await this.prisma.iNSInstituicao.findUnique({
      where: { INSCodigo: device.INSInstituicaoCodigo },
      select: { INSConfigHardware: true },
    });
    const hw = (inst?.INSConfigHardware ?? null) as InsConfigHardwareMonitorJson | null;
    const monitor = hw?.controlid?.monitor;
    const hostname = (monitor?.ip ?? '').trim();
    const path =
      monitor?.path !== undefined && monitor?.path !== null
        ? String(monitor.path)
        : '';
    const portRaw = monitor?.port;
    const port =
      portRaw !== undefined && portRaw !== null && String(portRaw).trim() !== ''
        ? String(portRaw).trim()
        : '';

    if (!hostname) {
      throw new BadRequestException(
        'Defina INSConfigHardware.controlid.monitor.ip (hostname) na instituição para configurar o Monitor (WEBHOOK).',
      );
    }
    if (!port) {
      throw new BadRequestException(
        'Defina INSConfigHardware.controlid.monitor.port na instituição para configurar o Monitor (WEBHOOK).',
      );
    }

    const payload = {
      monitor: {
        path,
        hostname,
        port,
        request_timeout: '8000',
        inform_access_event_id: '1',
      },
    };

    const hosts = this.collectMonitorTargetHosts(device);
    if (hosts.length === 0) {
      throw new BadRequestException(
        'Nenhum host para aplicar o monitor: informe EQPEnderecoIp e/ou ip_entry e ip_exit no equipamento.',
      );
    }

    const results: Array<{
      host: string;
      ok: boolean;
      data?: unknown;
      error?: string;
    }> = [];

    for (const host of hosts) {
      try {
        const transport = this.transportForHost(device, host);
        const data = await this.sendSetConfigurationOnHost(transport, payload);
        results.push({ host, ok: true, data });
      } catch (error: any) {
        results.push({
          host,
          ok: false,
          error: this.getErrorDetails(error),
        });
      }
    }

    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      throw new BadRequestException({
        message:
          'Falha ao configurar o monitor em um ou mais hosts do equipamento.',
        results,
      });
    }

    return {
      applied: true,
      type: HardwareEquipmentConfigType.WEBHOOK,
      monitor: payload.monitor,
      results,
    };
  }

  async applyEquipmentConfiguration(
    device: EQPEquipamento,
    type: HardwareEquipmentConfigType,
  ): Promise<unknown> {
    this.logger.log(
      `[ControlID] applyEquipmentConfiguration EQP=${device.EQPCodigo} tipo=${type}`,
    );
    switch (type) {
      case HardwareEquipmentConfigType.GERAL:
        return this.configGeral(device);
      case HardwareEquipmentConfigType.BOX:
        return await this.configBox(device);
      case HardwareEquipmentConfigType.WEBHOOK:
        return await this.configMonitor(device);
      default: {
        const _exhaustive: never = type;
        throw new BadRequestException(
          `Tipo de configuração não suportado: ${_exhaustive}`,
        );
      }
    }
  }

  async customCommand(cmd: string, params?: any): Promise<any> {
    return this.customCommandImpl(cmd, params);
  }

  protected async customCommandImpl(cmd: string, params?: any): Promise<any> {
    return this.withRetry(async () => {
      await this.ensureSession();
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
    });
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
