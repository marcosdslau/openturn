import { Injectable, Logger } from '@nestjs/common';
import {
  HttpMetodo,
  Prisma,
  TipoRotina,
  WebhookTokenSource,
} from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { TenantService } from '../../../../common/tenant/tenant.service';
import {
  applyInstitutionFusoHorarioToNotifyTime,
  parseControlidBodyTimeToBigIntSeconds,
} from '../utils/controlid-notify-time.util';

@Injectable()
export class ControlidMonitorService {
  private readonly logger = new Logger(ControlidMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private ctlStr(v: unknown): string | undefined {
    if (v === undefined || v === null) return undefined;
    return String(v);
  }

  private ctlBigInt(v: unknown, fallback = 0n): bigint {
    if (v === undefined || v === null) return fallback;
    try {
      return BigInt(String(v));
    } catch {
      return fallback;
    }
  }

  private daoChangeDedupKey(
    ctlObject: string,
    changeType: string,
    valuesId: string | undefined,
  ) {
    return `${ctlObject}\0${changeType}\0${valuesId ?? ''}`;
  }

  private catraEventDedupKey(
    accessEventId: string,
    eventUuid: string | undefined | null,
  ) {
    return `${accessEventId}\0${eventUuid ?? ''}`;
  }

  private async getInsFusoHorarioForControlid(
    instituicaoCodigo: number,
  ): Promise<number> {
    const inst = await this.prisma.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoCodigo },
      select: { INSFusoHorario: true },
    });
    return inst?.INSFusoHorario ?? -3;
  }

  async persistControlidDao(instituicaoCodigo: number, body: any) {
    if (
      !body ||
      !Array.isArray(body.object_changes) ||
      body.object_changes.length === 0
    ) {
      return;
    }
    const deviceId = this.ctlStr(body.device_id) ?? '';
    const originTime = parseControlidBodyTimeToBigIntSeconds(body?.time);
    if (originTime === null) {
      return;
    }
    const offsetHoras =
      await this.getInsFusoHorarioForControlid(instituicaoCodigo);
    const notifyTime = applyInstitutionFusoHorarioToNotifyTime(
      originTime,
      offsetHoras,
    );
    const changesByKey = new Map<string, any>();
    for (const change of body.object_changes) {
      const v = change?.values ?? {};
      const ctlObject = this.ctlStr(change?.object) ?? '';
      const changeType = this.ctlStr(change?.type) ?? '';
      const valuesId = this.ctlStr(v.id);
      changesByKey.set(
        this.daoChangeDedupKey(ctlObject, changeType, valuesId),
        change,
      );
    }

    await this.tenantService.runWithTenant(instituicaoCodigo, async () => {
      const existingRows = await this.prisma.rls.cTLControlidDao.findMany({
        where: {
          INSInstituicaoCodigo: instituicaoCodigo,
          deviceId,
          originTime,
        },
      });
      const byKey = new Map<string, (typeof existingRows)[number]>();
      for (const row of existingRows) {
        byKey.set(
          this.daoChangeDedupKey(
            row.ctlObject,
            row.changeType,
            row.valuesId ?? undefined,
          ),
          row,
        );
      }
      const incomingKeys = new Set<string>(changesByKey.keys());
      const toCreate: Prisma.CTLControlidDaoCreateManyInput[] = [];

      for (const change of changesByKey.values()) {
        const v = change?.values ?? {};
        const ctlObject = this.ctlStr(change?.object) ?? '';
        const changeType = this.ctlStr(change?.type) ?? '';
        const valuesId = this.ctlStr(v.id);
        const key = this.daoChangeDedupKey(ctlObject, changeType, valuesId);
        incomingKeys.add(key);

        const valuesPayload = {
          valuesTime: this.ctlStr(v.time),
          valuesEvent: this.ctlStr(v.event),
          valuesDeviceId: this.ctlStr(v.device_id),
          valuesIdentifierId: this.ctlStr(v.identifier_id),
          valuesUserId: this.ctlStr(v.user_id),
          valuesPortalId: this.ctlStr(v.portal_id),
          valuesIdentificationRuleId: this.ctlStr(v.identification_rule_id),
          valuesCardValue: this.ctlStr(v.card_value),
          valuesQrcodeValue: this.ctlStr(v.qrcode_value),
          valuesPinValue: this.ctlStr(v.pin_value),
          valuesConfidence: this.ctlStr(v.confidence),
          valuesMask: this.ctlStr(v.mask),
          valuesLogTypeId: this.ctlStr(v.log_type_id),
        };

        const found = byKey.get(key);
        if (found) {
          await this.prisma.rls.cTLControlidDao.update({
            where: { CTDCodigo: found.CTDCodigo },
            data: {
              ctlObject,
              changeType,
              valuesId: valuesId ?? null,
              ...valuesPayload,
            },
          });
        } else {
          toCreate.push({
            INSInstituicaoCodigo: instituicaoCodigo,
            deviceId,
            originTime,
            notifyTime,
            ctlObject,
            changeType,
            valuesId: valuesId ?? null,
            ...valuesPayload,
            processed: false,
          });
        }
      }

      const orphanIds = existingRows
        .filter(
          (r) =>
            !incomingKeys.has(
              this.daoChangeDedupKey(
                r.ctlObject,
                r.changeType,
                r.valuesId ?? undefined,
              ),
            ),
        )
        .map((r) => r.CTDCodigo);
      if (orphanIds.length > 0) {
        await this.prisma.rls.cTLControlidDao.deleteMany({
          where: { CTDCodigo: { in: orphanIds } },
        });
      }
      if (toCreate.length > 0) {
        await this.prisma.rls.cTLControlidDao.createMany({ data: toCreate });
      }
    });
    this.maybeTriggerControlidMonitorWebhook(instituicaoCodigo, body);
  }

  async persistControlidCatraEvent(instituicaoCodigo: number, body: any) {
    if (!body) return;
    const ev = body.event ?? {};
    const eventTimeRaw = ev.time;
    const deviceId = this.ctlStr(body.device_id) ?? '';
    const originTime = parseControlidBodyTimeToBigIntSeconds(body?.time);
    if (originTime === null) {
      return;
    }
    const offsetHoras =
      await this.getInsFusoHorarioForControlid(instituicaoCodigo);
    const notifyTime = applyInstitutionFusoHorarioToNotifyTime(
      originTime,
      offsetHoras,
    );
    const accessEventId = this.ctlStr(body.access_event_id) ?? '';
    const eventUuid = this.ctlStr(ev.uuid);
    const key = this.catraEventDedupKey(accessEventId, eventUuid);

    const eventPayload = {
      eventType: this.ctlStr(ev.type) ?? '',
      eventName: this.ctlStr(ev.name),
      eventTime:
        eventTimeRaw !== undefined && eventTimeRaw !== null
          ? this.ctlBigInt(eventTimeRaw)
          : null,
      eventUuid: eventUuid ?? null,
    };

    await this.tenantService.runWithTenant(instituicaoCodigo, async () => {
      const existingRows =
        await this.prisma.rls.cTLControlidCatraEvent.findMany({
          where: {
            INSInstituicaoCodigo: instituicaoCodigo,
            deviceId,
            originTime,
          },
        });
      const byKey = new Map<string, (typeof existingRows)[number]>();
      for (const row of existingRows) {
        byKey.set(
          this.catraEventDedupKey(row.accessEventId, row.eventUuid),
          row,
        );
      }
      const incomingKeys = new Set<string>([key]);
      const found = byKey.get(key);
      if (found) {
        await this.prisma.rls.cTLControlidCatraEvent.update({
          where: { CTCCodigo: found.CTCCodigo },
          data: {
            accessEventId,
            ...eventPayload,
          },
        });
      } else {
        await this.prisma.rls.cTLControlidCatraEvent.create({
          data: {
            INSInstituicaoCodigo: instituicaoCodigo,
            deviceId,
            originTime,
            notifyTime,
            accessEventId,
            ...eventPayload,
            processed: false,
          },
        });
      }
      const orphanIds = existingRows
        .filter(
          (r) =>
            !incomingKeys.has(
              this.catraEventDedupKey(r.accessEventId, r.eventUuid),
            ),
        )
        .map((r) => r.CTCCodigo);
      if (orphanIds.length > 0) {
        await this.prisma.rls.cTLControlidCatraEvent.deleteMany({
          where: { CTCCodigo: { in: orphanIds } },
        });
      }
    });
    this.maybeTriggerControlidMonitorWebhook(instituicaoCodigo, body);
  }

  private maybeTriggerControlidMonitorWebhook(
    instituicaoCodigo: number,
    rawBody: any,
  ) {
    void this.triggerControlidMonitorWebhook(instituicaoCodigo, rawBody).catch(
      (err) => {
        this.logger.warn(
          `[ControlID monitor] Falha ao disparar rotina webhook: ${err?.message || err}`,
        );
      },
    );
  }

  private monitorWebhookPayload(rawBody: any): {
    device_id: number | string;
    time: number | string;
  } | null {
    if (rawBody?.device_id === undefined || rawBody?.time === undefined)
      return null;
    const d = Number(rawBody.device_id);
    const t = Number(rawBody.time);
    return {
      device_id: Number.isFinite(d) ? d : String(rawBody.device_id),
      time: Number.isFinite(t) ? t : String(rawBody.time),
    };
  }

  private async triggerControlidMonitorWebhook(
    instituicaoCodigo: number,
    rawBody: any,
  ) {
    const apiUrl = process.env.API_URL?.trim();
    if (!apiUrl) {
      this.logger.debug(
        '[ControlID monitor] API_URL não definida; pulando disparo de rotina.',
      );
      return;
    }

    const payload = this.monitorWebhookPayload(rawBody);
    if (!payload) return;

    const inst = await this.prisma.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoCodigo },
      select: {
        INSControlidMonitorRotinaAtiva: true,
        INSControlidMonitorRotinaCodigo: true,
      },
    });

    if (
      !inst?.INSControlidMonitorRotinaAtiva ||
      !inst.INSControlidMonitorRotinaCodigo
    )
      return;

    const rotina = await this.prisma.rOTRotina.findFirst({
      where: {
        ROTCodigo: inst.INSControlidMonitorRotinaCodigo,
        INSInstituicaoCodigo: instituicaoCodigo,
        ROTTipo: TipoRotina.WEBHOOK,
        ROTAtivo: true,
      },
    });

    if (!rotina?.ROTWebhookPath?.trim() || !rotina.ROTWebhookMetodo) return;

    const base = apiUrl.replace(/\/$/, '');
    const pathSeg = rotina.ROTWebhookPath.startsWith('/')
      ? rotina.ROTWebhookPath
      : `/${rotina.ROTWebhookPath}`;
    const url = `${base}/instituicoes/${instituicaoCodigo}/webhooks${pathSeg}`;

    const tokenKey = rotina.ROTWebhookTokenKey || 'x-webhook-token';
    const headers: Record<string, string> = {};
    const tokenSource =
      rotina.ROTWebhookTokenSource || WebhookTokenSource.HEADER;

    if (
      rotina.ROTWebhookSeguro &&
      rotina.ROTWebhookToken &&
      tokenSource === WebhookTokenSource.HEADER
    ) {
      headers[tokenKey] = rotina.ROTWebhookToken;
    }

    const method = rotina.ROTWebhookMetodo;
    const params: Record<string, string | number> = {};

    if (method === HttpMetodo.GET) {
      params.device_id = payload.device_id;
      params.time = payload.time;
    }

    if (
      rotina.ROTWebhookSeguro &&
      rotina.ROTWebhookToken &&
      tokenSource === WebhookTokenSource.QUERY
    ) {
      params[tokenKey] = rotina.ROTWebhookToken;
    }

    const config: Parameters<typeof axios.request>[0] = {
      method: method as string,
      url,
      timeout: 15_000,
      headers,
      validateStatus: () => true,
    };

    if (method === HttpMetodo.GET) {
      config.params = params;
    } else if (
      method === HttpMetodo.POST ||
      method === HttpMetodo.PUT ||
      method === HttpMetodo.PATCH
    ) {
      config.data = payload;
      headers['Content-Type'] = 'application/json';
      if (Object.keys(params).length > 0) config.params = params;
    } else {
      this.logger.warn(
        `[ControlID monitor] Método HTTP não suportado para disparo: ${String(method)}`,
      );
      return;
    }

    const res = await axios.request(config);
    if (res.status < 200 || res.status >= 300) {
      this.logger.warn(
        `[ControlID monitor] Webhook rotina respondeu ${res.status} para ${url}`,
      );
    }
  }
}
