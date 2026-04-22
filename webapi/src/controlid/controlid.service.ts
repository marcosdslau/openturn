import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TenantService } from '../common/tenant/tenant.service';
import { StatusComando, AcaoPassagem, CTLControlidCatraEvent } from '@prisma/client';
import { HardwareService } from '../hardware/hardware.service';
import { ControlIDConfig } from '../hardware/interfaces/hardware.types';
import {
    extractControlidCatraRotationCode,
    resolveControlidCatraAcaoPassagem,
} from './controlid-catra-event.util';
import {
    applyInstitutionFusoHorarioToNotifyTime,
    formatControlidSecondsForBody,
    parseControlidBodyTimeToBigIntSeconds,
} from './controlid-notify-time.util';

/** Converte `user_id` do ControlID em `PESCodigo` inteiro válido, ou `null` se ausente/ inválido. */
function parseControlidUserIdToPescodigo(userId: unknown): number | null {
    if (userId === undefined || userId === null) return null;
    if (typeof userId === 'string' && userId.trim() === '') return null;
    const n = typeof userId === 'number' ? userId : parseInt(String(userId).trim(), 10);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
    return n;
}

function buildSyntheticCatraBodyFromStoredRow(
    row: Pick<CTLControlidCatraEvent, 'eventType' | 'eventName' | 'eventTime' | 'originTime'>,
    deviceIdStr: string,
    valuesEventFromDao: string | null,
): any {
    const timeForBody = formatControlidSecondsForBody(row.originTime);
    const et = row.eventType?.trim();
    const ve = valuesEventFromDao?.trim();
    let event: any;
    if (et && /^-?\d+$/.test(et)) {
        event = parseInt(et, 10);
    } else if (ve && /^-?\d+$/.test(ve)) {
        event = parseInt(ve, 10);
    } else if (et) {
        event = {
            type: et,
            name: row.eventName ?? undefined,
            time: row.eventTime != null ? row.eventTime.toString() : undefined,
        };
    } else if (ve) {
        event = { type: ve };
    } else {
        event = {};
    }
    return { device_id: deviceIdStr, time: timeForBody, event };
}

@Injectable()
export class ControlidService {
    private readonly logger = new Logger(ControlidService.name);

    constructor(
        private prisma: PrismaService,
        private readonly hardwareService: HardwareService,
        private readonly tenantService: TenantService,
    ) { }

    /**
     * Push: retorna o próximo comando PENDENTE para o equipamento e marca como ENVIADO
     */
    async getPendingCommand(equipamentoCodigo: number) {
        const cmd = await this.prisma.cMDComandoFila.findFirst({
            where: { EQPCodigo: equipamentoCodigo, CMDStatus: StatusComando.PENDENTE },
            orderBy: { createdAt: 'asc' },
        });

        if (!cmd) return {};

        await this.prisma.cMDComandoFila.update({
            where: { CMDCodigo: cmd.CMDCodigo },
            data: { CMDStatus: StatusComando.ENVIADO },
        });

        return {
            verb: cmd.CMDVerb,
            endpoint: cmd.CMDEndpoint,
            body: cmd.CMDBody,
            contentType: cmd.CMDContentType,
        };
    }

    /**
     * Result: processa o retorno da execução de um comando Push
     */
    async processResult(equipamentoCodigo: number, resultado: any) {
        const cmd = await this.prisma.cMDComandoFila.findFirst({
            where: { EQPCodigo: equipamentoCodigo, CMDStatus: StatusComando.ENVIADO },
            orderBy: { createdAt: 'asc' },
        });

        if (cmd) {
            await this.prisma.cMDComandoFila.update({
                where: { CMDCodigo: cmd.CMDCodigo },
                data: {
                    CMDStatus: StatusComando.EXECUTADO,
                    CMDResultado: resultado,
                },
            });
            this.logger.log(`Command ${cmd.CMDCodigo} executed for device ${equipamentoCodigo}`);
        }
    }

    /**
     * Após persistir DAO: se já existir `controlid_catra_event` com mesmo device_id + originTime
     * e ainda não processado, completa o registro de passagem (usuário vem do DAO).
     */
    async tryRegisterPassagemAfterControlidDao(instituicaoCodigo: number, body: any) {
        if (!body || !Array.isArray(body.object_changes) || body.object_changes.length === 0) {
            return;
        }
        const deviceIdStr = body?.device_id != null ? String(body.device_id) : '';
        if (!deviceIdStr) return;
        const originTime = parseControlidBodyTimeToBigIntSeconds(body?.time);
        if (originTime === null) return;

        const { catraRow, daoUserId, daoValuesEvent } = await this.tenantService.runWithTenant(
            instituicaoCodigo,
            async () => {
                const cr = await this.prisma.rls.cTLControlidCatraEvent.findFirst({
                    where: {
                        INSInstituicaoCodigo: instituicaoCodigo,
                        deviceId: deviceIdStr,
                        originTime,
                        processed: false,
                    },
                    orderBy: { CTCCodigo: 'asc' },
                });
                const daoRow = await this.prisma.rls.cTLControlidDao.findFirst({
                    where: {
                        INSInstituicaoCodigo: instituicaoCodigo,
                        deviceId: deviceIdStr,
                        originTime,
                        valuesUserId: { not: null },
                    },
                    orderBy: { CTDCodigo: 'desc' },
                    select: { valuesUserId: true, valuesEvent: true },
                });
                return {
                    catraRow: cr,
                    daoUserId: daoRow?.valuesUserId?.trim() || null,
                    daoValuesEvent: daoRow?.valuesEvent?.trim() || null,
                };
            },
        );

        if (!catraRow || !daoUserId) {
            return;
        }

        const syntheticBody = buildSyntheticCatraBodyFromStoredRow(
            catraRow,
            deviceIdStr,
            daoValuesEvent,
        );

        await this.registrarPassagemCore(syntheticBody, {
            valuesUserIdOverride: daoUserId,
            userIdSourceLabel: 'DAO-após-catra',
            persistedNotifyTimeForReg: catraRow.notifyTime,
        });
    }

    /**
     * Monitor (catra_event): registra passagem pela catraca
     */
    async registrarPassagem(body: any) {
        await this.registrarPassagemCore(body, {});
    }

    private async registrarPassagemCore(
        body: any,
        opts: {
            valuesUserIdOverride?: string | null;
            userIdSourceLabel?: string;
            /** notifyTime já persistido em CTL (fluxo DAO→catra); evita divergência se INSFusoHorario mudar. */
            persistedNotifyTimeForReg?: bigint;
        },
    ) {
        const deviceId = body.device_id;

        const resolved = await this.hardwareService.resolveEquipamentoFromControlidDeviceId(deviceId);
        if (!resolved) {
            this.logger.warn(`Device ${deviceId} not found, ignoring catra_event`);
            return;
        }

        const { equipamento, matchedField } = resolved;
        const instCodigo = equipamento.INSInstituicaoCodigo;
        const deviceIdStr = deviceId !== undefined && deviceId !== null ? String(deviceId) : '';

        const inst = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instCodigo },
            select: { INSFusoHorario: true },
        });
        const offsetHoras = inst?.INSFusoHorario ?? -3;

        const originTime = parseControlidBodyTimeToBigIntSeconds(body?.time);
        const notifyTimeComputed =
            originTime !== null ? applyInstitutionFusoHorarioToNotifyTime(originTime, offsetHoras) : null;
        const notifyTimeForReg =
            opts.persistedNotifyTimeForReg !== undefined
                ? opts.persistedNotifyTimeForReg
                : notifyTimeComputed;

        if (deviceIdStr !== '' && originTime !== null) {
            const alreadyDone = await this.isCatraBatchFullyProcessed(
                instCodigo,
                deviceIdStr,
                originTime,
            );
            if (alreadyDone) {
                this.logger.debug(
                    `[ControlID] passagem já registrada (catra batch processado) device=${deviceIdStr} originTime=${originTime.toString()}`,
                );
                return;
            }
        }

        const config = (equipamento.EQPConfig || {}) as unknown as ControlIDConfig;
        const acao = resolveControlidCatraAcaoPassagem({
            body,
            config,
            matchedField,
            equipamento: {
                deviceId: (equipamento as { deviceId?: string | null }).deviceId,
                EQPEnderecoIp: equipamento.EQPEnderecoIp,
            },
        });
        const rot = extractControlidCatraRotationCode(body);
        if (rot !== null && rot !== 7 && rot !== 8) {
            this.logger.warn(
                `[ControlID] catra_event: código de giro inesperado (${rot}) device=${deviceId}; usando regra aplicável`,
            );
        }
        if (rot === null && config.entry_direction_applied_by_equipment === true) {
            this.logger.warn(
                `[ControlID] catra_event: não foi possível extrair giro do payload device=${deviceId}; fallback nativo`,
            );
        }

        const override = opts.valuesUserIdOverride?.trim() || null;
        let valuesUserIdFromDao: string | null = null;
        if (!override && deviceIdStr !== '' && originTime !== null) {
            await this.tenantService.runWithTenant(instCodigo, async () => {
                const row = await this.prisma.rls.cTLControlidDao.findFirst({
                    where: {
                        INSInstituicaoCodigo: instCodigo,
                        deviceId: deviceIdStr,
                        originTime,
                        valuesUserId: { not: null },
                    },
                    orderBy: { CTDCodigo: 'desc' },
                });
                const vu = row?.valuesUserId?.trim();
                if (vu) valuesUserIdFromDao = vu;
            });
        }

        const userIdResolved = override ?? valuesUserIdFromDao ?? body.user_id;
        const pescodigo = parseControlidUserIdToPescodigo(userIdResolved);
        if (pescodigo == null) {
            this.logger.warn(
                `[ControlID] catra_event: usuário não resolvido (override=${override ?? '—'}, DAO=${valuesUserIdFromDao ?? '—'}, body.user_id=${String(body.user_id)}); ignorando passagem device=${deviceId} time=${String(body?.time)}`,
            );
            return;
        }

        const pessoa = await this.prisma.pESPessoa.findFirst({
            where: { PESIdExterno: `${pescodigo}` },
        });

        if (!pessoa) {
            this.logger.warn(
                `User ${userIdResolved} (PESCodigo ${pescodigo}) not found for device ${deviceId}, ignoring catra_event`,
            );
            return;
        }

        const regSeconds =
            notifyTimeForReg !== null && notifyTimeForReg !== undefined
                ? notifyTimeForReg
                : BigInt(Math.floor(Date.now() / 1000));
        const dataHora = new Date(Number(regSeconds) * 1000);

        await this.prisma.rEGRegistroPassagem.create({
            data: {
                PESCodigo: pessoa.PESCodigo,
                REGAcao: acao,
                EQPCodigo: equipamento.EQPCodigo,
                REGTimestamp: regSeconds,
                REGDataHora: dataHora,
                INSInstituicaoCodigo: equipamento.INSInstituicaoCodigo,
            },
        });

        if (deviceIdStr !== '' && originTime !== null) {
            await this.markCatraBatchProcessed(instCodigo, deviceIdStr, originTime);
        }

        const userSource =
            opts.userIdSourceLabel ??
            (override != null ? 'DAO' : valuesUserIdFromDao != null ? 'DAO' : 'body');
        this.logger.log(
            `Passagem registrada: Pessoa ${pessoa.PESCodigo} - ${acao} - Device ${deviceId} (EQP ${equipamento.EQPCodigo}, ${matchedField}; user via ${userSource})`,
        );
    }

    /** Há linhas em controlid_catra_event para o trio e todas com processed=true. */
    private async isCatraBatchFullyProcessed(
        instCodigo: number,
        deviceIdStr: string,
        originTime: bigint,
    ): Promise<boolean> {
        return this.tenantService.runWithTenant(instCodigo, async () => {
            const rows = await this.prisma.rls.cTLControlidCatraEvent.findMany({
                where: {
                    INSInstituicaoCodigo: instCodigo,
                    deviceId: deviceIdStr,
                    originTime,
                },
            });
            if (rows.length === 0) return false;
            return rows.every((r) => r.processed);
        });
    }

    private async markCatraBatchProcessed(
        instCodigo: number,
        deviceIdStr: string,
        originTime: bigint,
    ): Promise<void> {
        await this.tenantService.runWithTenant(instCodigo, async () => {
            await this.prisma.rls.cTLControlidCatraEvent.updateMany({
                where: {
                    INSInstituicaoCodigo: instCodigo,
                    deviceId: deviceIdStr,
                    originTime,
                    processed: false,
                },
                data: { processed: true },
            });
        });
    }

    /**
     * Online (new_user_identified): valida e decide acesso em tempo real
     */
    async validarAcessoOnline(body: any) {
        const userId = body.user_id;
        const deviceId = body.device_id;

        const pescodigo = parseControlidUserIdToPescodigo(userId);
        const pessoa =
            pescodigo != null
                ? await this.prisma.pESPessoa.findFirst({
                      where: { PESCodigo: pescodigo },
                  })
                : null;

        if (!pessoa || !pessoa.PESAtivo) {
            return {
                result: {
                    event: 6, // Acesso negado
                    user_id: userId,
                    user_name: pessoa?.PESNome || 'Desconhecido',
                    user_image: false,
                    actions: [],
                    message: pessoa ? 'Acesso Bloqueado - Usuário Inativo' : 'Acesso Negado - Não Identificado',
                },
            };
        }

        // Registrar passagem automaticamente quando acesso é concedido
        const resolved = await this.hardwareService.resolveEquipamentoFromControlidDeviceId(deviceId);
        const equipamento = resolved?.equipamento;

        if (equipamento) {
            const now = new Date();
            await this.prisma.rEGRegistroPassagem.create({
                data: {
                    PESCodigo: pessoa.PESCodigo,
                    REGAcao: AcaoPassagem.ENTRADA,
                    EQPCodigo: equipamento.EQPCodigo,
                    REGTimestamp: BigInt(Math.floor(now.getTime() / 1000)),
                    REGDataHora: now,
                    INSInstituicaoCodigo: equipamento.INSInstituicaoCodigo,
                },
            });
        }

        return {
            result: {
                event: 7, // Acesso concedido
                user_id: userId,
                user_name: pessoa.PESNome,
                user_image: !!pessoa.PESFotoBase64,
                portal_id: 1,
                actions: [
                    { action: 'catra', parameters: 'allow=clockwise' },
                ],
                message: 'Acesso Liberado',
            },
        };
    }

    /**
     * Enfileira um comando para envio via Push
     */
    async enqueueCommand(
        equipamentoCodigo: number,
        instituicaoCodigo: number,
        endpoint: string,
        body: any,
        verb = 'POST',
    ) {
        return this.prisma.cMDComandoFila.create({
            data: {
                EQPCodigo: equipamentoCodigo,
                CMDVerb: verb,
                CMDEndpoint: endpoint,
                CMDBody: body,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });
    }
}
