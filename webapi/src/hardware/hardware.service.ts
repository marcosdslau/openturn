
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
    EQPEquipamento,
    HttpMetodo,
    Prisma,
    TipoRotina,
    WebhookTokenSource,
} from '@prisma/client';
import axios from 'axios';
import { IHardwareProvider, ControlIDConfig, HardwareBrand } from './interfaces/hardware.types';
import { ControlIDProvider } from './providers/controlid.provider';
import { HikvisionProvider } from './providers/hikvision.provider';
import { WsRelayGateway } from '../connector/ws-relay.gateway';
import { ConnectorService } from '../connector/connector.service';
import { TenantService } from '../common/tenant/tenant.service';

@Injectable()
export class HardwareService {
    private readonly logger = new Logger(HardwareService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly wsRelay: WsRelayGateway,
        private readonly connectorService: ConnectorService,
        private readonly tenantService: TenantService,
    ) { }

    instantiate(equipment: EQPEquipamento, overrideHost?: string): IHardwareProvider {
        if (equipment.EQPMarca === HardwareBrand.CONTROLID) {
            // Parse config safely
            const config = equipment.EQPConfig as unknown as ControlIDConfig;

            // Determine effective host with fallbacks
            const host = overrideHost
                || config?.host
                || config?.ip_entry
                || config?.ip_exit
                || equipment.EQPEnderecoIp;

            if (!host) {
                throw new Error(`Invalid configuration for equipment ${equipment.EQPCodigo}: No valid host/IP found.`);
            }

            // Create a config copy with the effective host
            const effectiveConfig: ControlIDConfig = {
                ...(config || {} as ControlIDConfig),
                host,
                model: equipment.EQPModelo || undefined // Inject model from equipment
            };

            return new ControlIDProvider(effectiveConfig, this.prisma);
        }

        if (equipment.EQPMarca === HardwareBrand.HIKVISION) {
            return new HikvisionProvider(equipment.EQPConfig, this.prisma);
        }

        throw new Error(`Unsupported hardware brand: ${equipment.EQPMarca}`);
    }

    async syncAll(instituicaoId: number) {
        // Implementation to sync all users to all devices of an institution
        // Fetch all devices
        const devices = await this.prisma.eQPEquipamento.findMany({
            where: { INSInstituicaoCodigo: instituicaoId, EQPAtivo: true }
        });

        // Fetch all active people with their credentials
        const people = await this.prisma.pESPessoa.findMany({
            where: { INSInstituicaoCodigo: instituicaoId, PESAtivo: true },
            // include photos? PESFotoBase64 is loaded.
        });

        for (const dev of devices) {
            try {
                const provider = this.instantiate(dev);
                for (const person of people) {
                    let fingers: string[] = [];
                    if (person.PESTemplates && Array.isArray(person.PESTemplates)) {
                        fingers = person.PESTemplates as string[];
                    }

                    // 1. Check if mapping exists
                    const mapping = await this.prisma.rls.pESEquipamentoMapeamento.findUnique({
                        where: {
                            PESCodigo_EQPCodigo: {
                                PESCodigo: person.PESCodigo,
                                EQPCodigo: dev.EQPCodigo,
                            },
                        },
                    });

                    // 2. Sync (Provider handles mapping internally now)
                    await provider.syncPerson(dev.EQPCodigo, {
                        id: mapping ? parseInt(mapping.PEQIdNoEquipamento, 10) : person.PESCodigo,
                        name: person.PESNome,
                        cpf: person.PESDocumento || undefined,
                        faceExtension: person.PESFotoExtensao || "jpg",
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

    async executeCommand(equipmentId: number, command: string, params?: any, targetIp?: string): Promise<any> {
        const device = await this.prisma.eQPEquipamento.findUnique({
            where: { EQPCodigo: equipmentId }
        });

        if (!device) {
            throw new Error(`Equipment ${equipmentId} not found`);
        }

        // Validate targetIp if provided
        if (targetIp) {
            const config = device.EQPConfig as unknown as ControlIDConfig;
            const allowedIps = [
                device.EQPEnderecoIp,
                config?.host,
                config?.ip_entry,
                config?.ip_exit
            ].filter(ip => !!ip); // filter undefined/null/empty

            if (!allowedIps.includes(targetIp)) {
                throw new Error(`Invalid target IP ${targetIp} for device ${equipmentId}`);
            }
        }

        // Route through WS relay for addon equipment
        if (device.EQPUsaAddon) {
            return this.executeCommandViaRelay(device, command, params, targetIp);
        }

        const provider = this.instantiate(device, targetIp);
        return await provider.customCommand(command, params);
    }

    /**
     * Execute a ControlID command via the WS relay (Connector → Device).
     * Handles login + session management transparently.
     */
    private async executeCommandViaRelay(
        device: EQPEquipamento,
        command: string,
        params?: any,
        targetIp?: string,
    ): Promise<any> {
        const config = device.EQPConfig as unknown as ControlIDConfig;
        const host = targetIp || config?.host || device.EQPEnderecoIp;

        if (!host) {
            throw new Error(`No valid IP for relay command on equipment ${device.EQPCodigo}`);
        }

        // Resolve the connector for the institution
        const connector = await this.connectorService.findByInstituicao(device.INSInstituicaoCodigo);
        const connectorId = connector.CONCodigo;

        // Build the device's base URL
        let baseUrl = host.includes('://') ? host : `http://${host}`;
        if (!host.includes(':')) {
            baseUrl += `:${config?.port || 80}`;
        }

        this.logger.log(`[Relay] Executing command "${command}" on device ${device.EQPCodigo} via connector ${connectorId} (${baseUrl})`);

        // Step 1: Login to get session
        const loginResult = await this.wsRelay.sendHttpRequest(
            connectorId,
            device.EQPCodigo,
            baseUrl,
            'POST',
            '/login.fcgi',
            { 'Content-Type': 'application/json' },
            JSON.stringify({
                login: config?.user || 'admin',
                password: config?.pass || 'admin',
            }),
        );

        const loginData = JSON.parse(loginResult.body.toString('utf-8'));
        const session = loginData.session;

        if (!session) {
            throw new Error(`Failed to get session from device ${device.EQPCodigo} via relay`);
        }

        // Step 2: Build the .fcgi command — forward all params to the device verbatim
        const fcgiMap: Record<string, { endpoint: string; body: any }> = {
            load_objects: {
                endpoint: `/load_objects.fcgi?session=${session}`,
                body: { ...params },
            },
            create_objects: {
                endpoint: `/create_objects.fcgi?session=${session}`,
                body: { ...params },
            },
            modify_objects: {
                endpoint: `/modify_objects.fcgi?session=${session}`,
                body: { ...params },
            },
            destroy_objects: {
                endpoint: `/destroy_objects.fcgi?session=${session}`,
                body: { ...params },
            },
        };

        const mapping = fcgiMap[command];
        if (!mapping) {
            throw new Error(`Unknown relay command: ${command}`);
        }

        // Step 3: Execute the command via relay
        const result = await this.wsRelay.sendHttpRequest(
            connectorId,
            device.EQPCodigo,
            baseUrl,
            'POST',
            mapping.endpoint,
            { 'Content-Type': 'application/json' },
            JSON.stringify(mapping.body),
        );

        return JSON.parse(result.body.toString('utf-8'));
    }

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

    private static readonly INT32_MIN = -2147483648;
    private static readonly INT32_MAX = 2147483647;

    /**
     * Resolve a instituição a partir do device_id do webhook ControlID.
     * 1) Coluna EQPEquipamento.deviceId (EQPDeviceId).
     * 2) EQPConfig no contrato ControlID: deviceId, deviceId_entry, deviceId_exit; onlineServerId (legado).
     * 3) Legado: device_id numérico int32 = EQPCodigo.
     */
    async resolveInstituicaoCodigoFromControlidDeviceId(deviceId: unknown): Promise<number | null> {
        const s = this.ctlStr(deviceId);
        if (s === undefined || s === '') return null;

        const byColumn = await this.prisma.eQPEquipamento.findFirst({
            where: { deviceId: s },
            select: { INSInstituicaoCodigo: true },
        });
        if (byColumn) return byColumn.INSInstituicaoCodigo;

        const rows = await this.prisma.$queryRaw<{ INSInstituicaoCodigo: number }[]>(
            Prisma.sql`
                SELECT e."INSInstituicaoCodigo"
                FROM "EQPEquipamento" e
                WHERE e."EQPMarca" = ${HardwareBrand.CONTROLID}
                  AND e."EQPConfig" IS NOT NULL
                  AND (
                    e."EQPConfig"->>'deviceId' = ${s}
                    OR e."EQPConfig"->>'deviceId_entry' = ${s}
                    OR e."EQPConfig"->>'deviceId_exit' = ${s}
                    OR e."EQPConfig"->>'onlineServerId' = ${s}
                  )
                LIMIT 1
            `,
        );
        if (rows[0]?.INSInstituicaoCodigo != null) return rows[0].INSInstituicaoCodigo;

        if (/^-?\d+$/.test(s)) {
            try {
                const bi = BigInt(s);
                if (
                    bi >= BigInt(HardwareService.INT32_MIN) &&
                    bi <= BigInt(HardwareService.INT32_MAX)
                ) {
                    const eq = await this.prisma.eQPEquipamento.findFirst({
                        where: { EQPCodigo: Number(bi) },
                        select: { INSInstituicaoCodigo: true },
                    });
                    if (eq) return eq.INSInstituicaoCodigo;
                }
            } catch {
                /* não é inteiro válido para BigInt */
            }
        }

        return null;
    }

    private daoChangeDedupKey(ctlObject: string, changeType: string, valuesId: string | undefined) {
        return `${ctlObject}\0${changeType}\0${valuesId ?? ''}`;
    }

    private catraEventDedupKey(accessEventId: string, eventUuid: string | undefined | null) {
        return `${accessEventId}\0${eventUuid ?? ''}`;
    }

    /**
     * Persiste payload bruto do webhook Monitor ControlID (DAO / object_changes).
     * Por tenant + (deviceId, notifyTime): atualiza linhas cuja chave (object, type, values.id)
     * já existe (mantém CTDCodigo, processed, createdAt); insere apenas alterações novas;
     * remove linhas do mesmo trio que deixaram de vir no payload.
     */
    async persistControlidDao(instituicaoCodigo: number, body: any) {
        if (!body || !Array.isArray(body.object_changes) || body.object_changes.length === 0) {
            return;
        }
        const deviceId = this.ctlStr(body.device_id) ?? '';
        const notifyTime = this.ctlBigInt(body.time);
        const changesByKey = new Map<string, any>();
        for (const change of body.object_changes) {
            const v = change?.values ?? {};
            const ctlObject = this.ctlStr(change?.object) ?? '';
            const changeType = this.ctlStr(change?.type) ?? '';
            const valuesId = this.ctlStr(v.id);
            changesByKey.set(this.daoChangeDedupKey(ctlObject, changeType, valuesId), change);
        }

        await this.tenantService.runWithTenant(instituicaoCodigo, async () => {
            const existingRows = await this.prisma.rls.cTLControlidDao.findMany({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    deviceId,
                    notifyTime,
                },
            });
            const byKey = new Map<string, (typeof existingRows)[number]>();
            for (const row of existingRows) {
                byKey.set(
                    this.daoChangeDedupKey(row.ctlObject, row.changeType, row.valuesId ?? undefined),
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
                            this.daoChangeDedupKey(r.ctlObject, r.changeType, r.valuesId ?? undefined),
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

    /**
     * Persiste payload bruto do webhook Monitor ControlID (catra_event).
     * Por tenant + (deviceId, notifyTime): atualiza se já existir a mesma chave
     * (access_event_id + event.uuid); cria se novo; remove órfãos do mesmo trio.
     */
    async persistControlidCatraEvent(instituicaoCodigo: number, body: any) {
        if (!body) return;
        const ev = body.event ?? {};
        const eventTimeRaw = ev.time;
        const deviceId = this.ctlStr(body.device_id) ?? '';
        const notifyTime = this.ctlBigInt(body.time);
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
            const existingRows = await this.prisma.rls.cTLControlidCatraEvent.findMany({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    deviceId,
                    notifyTime,
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
                        !incomingKeys.has(this.catraEventDedupKey(r.accessEventId, r.eventUuid)),
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

    /**
     * Dispara webhook da rotina configurada na instituição (HTTP para API_URL), sem bloquear o monitor.
     */
    private maybeTriggerControlidMonitorWebhook(instituicaoCodigo: number, rawBody: any) {
        void this.triggerControlidMonitorWebhook(instituicaoCodigo, rawBody).catch((err) => {
            this.logger.warn(
                `[ControlID monitor] Falha ao disparar rotina webhook: ${err?.message || err}`,
            );
        });
    }

    private monitorWebhookPayload(rawBody: any): {
        device_id: number | string;
        time: number | string;
    } | null {
        if (rawBody?.device_id === undefined || rawBody?.time === undefined) return null;
        const d = Number(rawBody.device_id);
        const t = Number(rawBody.time);
        return {
            device_id: Number.isFinite(d) ? d : String(rawBody.device_id),
            time: Number.isFinite(t) ? t : String(rawBody.time),
        };
    }

    private async triggerControlidMonitorWebhook(instituicaoCodigo: number, rawBody: any) {
        const apiUrl = process.env.API_URL?.trim();
        if (!apiUrl) {
            this.logger.debug('[ControlID monitor] API_URL não definida; pulando disparo de rotina.');
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

        if (!inst?.INSControlidMonitorRotinaAtiva || !inst.INSControlidMonitorRotinaCodigo) return;

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
        const tokenSource = rotina.ROTWebhookTokenSource || WebhookTokenSource.HEADER;

        if (rotina.ROTWebhookSeguro && rotina.ROTWebhookToken && tokenSource === WebhookTokenSource.HEADER) {
            headers[tokenKey] = rotina.ROTWebhookToken;
        }

        const method = rotina.ROTWebhookMetodo;
        const params: Record<string, string | number> = {};

        if (method === HttpMetodo.GET) {
            params.device_id = payload.device_id as string | number;
            params.time = payload.time as string | number;
        }

        if (rotina.ROTWebhookSeguro && rotina.ROTWebhookToken && tokenSource === WebhookTokenSource.QUERY) {
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

    /**
     * Unified entry point for executing provider methods by equipment ID.
     * Useful for routines and external triggers.
     */
    async executeProviderAction(equipmentId: number, method: keyof IHardwareProvider, args: any[]): Promise<any> {
        const device = await this.prisma.eQPEquipamento.findUnique({
            where: { EQPCodigo: equipmentId }
        });

        if (!device) throw new Error(`Equipment ${equipmentId} not found`);

        const provider = this.instantiate(device);

        if (typeof provider[method] !== 'function') {
            throw new Error(`Method ${method} not implemented for ${device.EQPMarca}`);
        }

        return await (provider[method] as any)(...args);
    }
}
