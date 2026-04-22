import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProcessManager } from './process-manager';
import { DbTenantProxy } from './db-tenant-proxy';
import { ConsoleGateway } from '../console.gateway';
import { StatusExecucao } from '@prisma/client';
import { HardwareService } from '../../hardware/hardware.service';
import { ModuleRef } from '@nestjs/core';
import { join } from 'path';

@Injectable()
export class ExecutionService {
    private readonly logger = new Logger(ExecutionService.name);
    private readonly maxConcurrent: number;
    private readonly rotinaLocks = new Set<number>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly processManager: ProcessManager,
        private readonly consoleGateway: ConsoleGateway,
        private readonly moduleRef: ModuleRef,
    ) {
        this.processManager.setConsoleGateway(consoleGateway);
        this.maxConcurrent = parseInt(process.env.ROTINA_MAX_CONCURRENT_MANUAL || '10', 10);
    }

    private async getHardwareService(): Promise<HardwareService> {
        return this.moduleRef.get(HardwareService, { strict: false });
    }

    async execute(
        rotinaCodigo: number,
        instituicaoCodigo: number,
        trigger: string,
        requestData?: any,
        options?: { skipActiveCheck?: boolean },
    ) {
        const inicio = new Date();

        const rotina = await this.prisma.rOTRotina.findFirst({
            where: {
                ROTCodigo: rotinaCodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
            include: { instituicao: true },
        });

        if (!rotina) {
            throw new Error('Rotina não encontrada');
        }

        if (!rotina.ROTAtivo && !options?.skipActiveCheck) {
            throw new Error('Rotina inativa');
        }

        if (this.rotinaLocks.has(rotinaCodigo)) {
            throw new Error('Rotina já possui uma execução em andamento');
        }

        if (this.processManager.getActiveCount() >= this.maxConcurrent) {
            throw new Error(`Limite de ${this.maxConcurrent} execuções simultâneas atingido`);
        }

        this.rotinaLocks.add(rotinaCodigo);

        const execLog = await this.prisma.rOTExecucaoLog.create({
            data: {
                ROTCodigo: rotinaCodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
                EXEStatus: StatusExecucao.EM_EXECUCAO,
                EXEInicio: inicio,
                EXETrigger: trigger,
                EXERequestBody: requestData?.body,
                EXERequestParams: requestData?.params,
                EXERequestPath: requestData?.path,
            },
        });

        const exeId = execLog.EXEIdExterno;

        try {
            const { context, rpcHandler } = await this.buildContext(instituicaoCodigo, requestData);

            const result = await this.processManager.executeInProcess(
                exeId,
                rotinaCodigo,
                rotina.ROTCodigoJS,
                context,
                rotina.ROTTimeoutSeconds,
                rpcHandler,
            );

            const finalStatus = result.cancelled
                ? StatusExecucao.CANCELADO
                : result.timedOut
                    ? StatusExecucao.TIMEOUT
                    : result.success
                        ? StatusExecucao.SUCESSO
                        : StatusExecucao.ERRO;

            const fim = new Date();
            await this.prisma.rOTExecucaoLog.update({
                where: { EXECodigo: execLog.EXECodigo },
                data: {
                    EXEStatus: finalStatus,
                    EXEFim: fim,
                    EXEDuracaoMs: result.duration,
                    EXEResultado: result.result,
                    EXEErro: result.error,
                    EXELogs: result.logs as any,
                },
            });

            await this.prisma.rOTRotina.update({
                where: { ROTCodigo: rotinaCodigo },
                data: { ROTUltimaExecucao: fim },
            });

            return {
                exeId,
                success: result.success,
                result: result.result,
                error: result.error,
                duration: result.duration,
                timedOut: result.timedOut,
            };
        } catch (error: any) {
            this.logger.error(`Execution error for ${exeId}:`, error);

            await this.prisma.rOTExecucaoLog.update({
                where: { EXECodigo: execLog.EXECodigo },
                data: {
                    EXEStatus: StatusExecucao.ERRO,
                    EXEFim: new Date(),
                    EXEDuracaoMs: Date.now() - inicio.getTime(),
                    EXEErro: error.message,
                },
            });

            throw error;
        } finally {
            this.rotinaLocks.delete(rotinaCodigo);
        }
    }

    async startExecution(
        rotinaCodigo: number,
        instituicaoCodigo: number,
        trigger: string,
        requestData?: any,
        options?: { skipActiveCheck?: boolean },
    ): Promise<string> {
        const rotina = await this.prisma.rOTRotina.findFirst({
            where: { ROTCodigo: rotinaCodigo, INSInstituicaoCodigo: instituicaoCodigo },
        });

        if (!rotina) throw new Error('Rotina não encontrada');
        if (!rotina.ROTAtivo && !options?.skipActiveCheck) throw new Error('Rotina inativa');
        if (this.rotinaLocks.has(rotinaCodigo)) throw new Error('Rotina já possui uma execução em andamento');
        if (this.processManager.getActiveCount() >= this.maxConcurrent) {
            throw new Error(`Limite de ${this.maxConcurrent} execuções simultâneas atingido`);
        }

        const execLog = await this.prisma.rOTExecucaoLog.create({
            data: {
                ROTCodigo: rotinaCodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
                EXEStatus: StatusExecucao.EM_EXECUCAO,
                EXEInicio: new Date(),
                EXETrigger: trigger,
                EXERequestBody: requestData?.body,
                EXERequestParams: requestData?.params,
                EXERequestPath: requestData?.path,
            },
        });

        const exeId = execLog.EXEIdExterno;
        this.rotinaLocks.add(rotinaCodigo);

        this.runInBackground(exeId, execLog.EXECodigo, rotinaCodigo, instituicaoCodigo, rotina.ROTCodigoJS, rotina.ROTTimeoutSeconds, requestData);

        return exeId;
    }

    private async runInBackground(
        exeId: string,
        exeCodigo: number,
        rotinaCodigo: number,
        instituicaoCodigo: number,
        code: string,
        timeoutSeconds: number,
        requestData?: any,
    ) {
        const inicio = new Date();
        try {
            const { context, rpcHandler } = await this.buildContext(instituicaoCodigo, requestData);
            const result = await this.processManager.executeInProcess(exeId, rotinaCodigo, code, context, timeoutSeconds, rpcHandler);

            const finalStatus = result.cancelled
                ? StatusExecucao.CANCELADO
                : result.timedOut
                    ? StatusExecucao.TIMEOUT
                    : result.success
                        ? StatusExecucao.SUCESSO
                        : StatusExecucao.ERRO;

            await this.prisma.rOTExecucaoLog.update({
                where: { EXECodigo: exeCodigo },
                data: {
                    EXEStatus: finalStatus,
                    EXEFim: new Date(),
                    EXEDuracaoMs: result.duration,
                    EXEResultado: result.result,
                    EXEErro: result.error,
                    EXELogs: result.logs as any,
                },
            });

            await this.prisma.rOTRotina.update({
                where: { ROTCodigo: rotinaCodigo },
                data: { ROTUltimaExecucao: new Date() },
            });
        } catch (error: any) {
            this.logger.error(`Background execution error for ${exeId}:`, error);
            await this.prisma.rOTExecucaoLog.update({
                where: { EXECodigo: exeCodigo },
                data: {
                    EXEStatus: StatusExecucao.ERRO,
                    EXEFim: new Date(),
                    EXEDuracaoMs: Date.now() - inicio.getTime(),
                    EXEErro: error.message,
                },
            });
        } finally {
            this.rotinaLocks.delete(rotinaCodigo);
        }
    }

    private async buildContext(instituicaoCodigo: number, requestData?: any) {
        const instituicao = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
        });

        const equipamentos = await this.prisma.eQPEquipamento.findMany({
            where: {
                INSInstituicaoCodigo: instituicaoCodigo,
                EQPAtivo: true,
            },
        });

        const dbProxy = new DbTenantProxy(this.prisma, instituicaoCodigo);
        const allowedModels = [
            'pESPessoa',
            'mATMatricula',
            'rEGRegistroPassagem',
            'eQPEquipamento',
            'pESEquipamentoMapeamento',
            'eRPConfiguracao',
            'iNSInstituicao',
            'cTLControlidDao',
            'cTLControlidCatraEvent',
        ];

        const schemaDefinition = {
            PESPessoa: {
                alias: 'Pessoa',
                fields: [
                    { name: "PESCodigo", type: "Int", pk: true },
                    { name: "PESIdExterno", type: "String" },
                    { name: "PESNome", type: "String" },
                    { name: "PESNomeSocial", type: "String" },
                    { name: "PESDocumento", type: "String" },
                    { name: "PESEmail", type: "String" },
                    { name: "PESTelefone", type: "String" },
                    { name: "PESCelular", type: "String" },
                    { name: "PESFotoBase64", type: "String" },
                    { name: "PESFotoExtensao", type: "String" },
                    { name: "PESGrupo", type: "String" },
                    { name: "PESCartaoTag", type: "String" },
                    { name: "PESAtivo", type: "Boolean" },
                    { name: "createdAt", type: "DateTime" },
                    { name: "updatedAt", type: "DateTime" },
                    { name: "deletedAt", type: "DateTime" },
                ]
            },
            MATMatricula: {
                alias: 'Matricula',
                fields: [
                    { name: "MATCodigo", type: "Int", pk: true },
                    { name: "PESCodigo", type: "Int", fk: "PESPessoa" },
                    { name: "MATNumero", type: "String" },
                    { name: "MATCurso", type: "String" },
                    { name: "MATSerie", type: "String" },
                    { name: "MATTurma", type: "String" },
                    { name: "MATAtivo", type: "Boolean" },
                    { name: "createdAt", type: "DateTime" },
                ]
            },
            REGRegistroPassagem: {
                alias: 'RegistroPassagem',
                fields: [
                    { name: "REGCodigo", type: "Int", pk: true },
                    { name: "PESCodigo", type: "Int", fk: "PESPessoa" },
                    { name: "EQPCodigo", type: "Int", fk: "EQPEquipamento" },
                    { name: "REGAcao", type: "Enum" },
                    { name: "REGTimestamp", type: "BigInt" },
                    { name: "REGDataHora", type: "DateTime" },
                    { name: "createdAt", type: "DateTime" },
                ]
            },
            EQPEquipamento: {
                alias: 'Equipamento',
                fields: [
                    { name: "EQPCodigo", type: "Int", pk: true },
                    { name: "EQPDescricao", type: "String" },
                    { name: "EQPMarca", type: "String" },
                    { name: "EQPModelo", type: "String" },
                    { name: "EQPEnderecoIp", type: "String" },
                    { name: "EQPAtivo", type: "Boolean" },
                    { name: "createdAt", type: "DateTime" },
                ]
            },
            ERPConfiguracao: {
                alias: 'ConfigERP',
                fields: [
                    { name: "ERPCodigo", type: "Int", pk: true },
                    { name: "ERPSistema", type: "String" },
                    { name: "ERPUrlBase", type: "String" },
                    { name: "ERPToken", type: "String" },
                    { name: "ERPConfigJson", type: "Json" },
                ]
            },
            INSInstituicao: {
                alias: 'Instituicao',
                fields: [
                    { name: "INSCodigo", type: "Int", pk: true },
                    { name: "INSNome", type: "String" },
                    { name: "INSAtivo", type: "Boolean" },
                    { name: "INSFusoHorario", type: "Int" },
                    { name: "INSConfigHardware", type: "Json" },
                ]
            },
            PESEquipamentoMapeamento: {
                alias: 'MapeamentoControle',
                fields: [
                    { name: "PESCodigo", type: "Int", pk: true, fk: "PESPessoa" },
                    { name: "EQPCodigo", type: "Int", pk: true, fk: "EQPEquipamento" },
                    { name: "PEQIdNoEquipamento", type: "String" },
                ]
            },
            CTLControlidDao: {
                alias: 'ControlIDDao',
                fields: [
                    { name: "CTDCodigo", type: "Int", pk: true },
                    { name: "INSInstituicaoCodigo", type: "Int", fk: "INSInstituicao" },
                    { name: "deviceId", type: "String" },
                    { name: "originTime", type: "BigInt" },
                    { name: "notifyTime", type: "BigInt" },
                    { name: "ctlObject", type: "String" },
                    { name: "changeType", type: "String" },
                    { name: "valuesId", type: "String" },
                    { name: "valuesTime", type: "String" },
                    { name: "valuesEvent", type: "String" },
                    { name: "valuesDeviceId", type: "String" },
                    { name: "valuesIdentifierId", type: "String" },
                    { name: "valuesUserId", type: "String" },
                    { name: "valuesPortalId", type: "String" },
                    { name: "valuesIdentificationRuleId", type: "String" },
                    { name: "valuesCardValue", type: "String" },
                    { name: "valuesQrcodeValue", type: "String" },
                    { name: "valuesPinValue", type: "String" },
                    { name: "valuesConfidence", type: "String" },
                    { name: "valuesMask", type: "String" },
                    { name: "valuesLogTypeId", type: "String" },
                    { name: "processed", type: "Boolean" },
                    { name: "createdAt", type: "DateTime" },
                ]
            },
            CTLControlidCatraEvent: {
                alias: 'ControlIDCatraEvent',
                fields: [
                    { name: "CTCCodigo", type: "Int", pk: true },
                    { name: "INSInstituicaoCodigo", type: "Int", fk: "INSInstituicao" },
                    { name: "deviceId", type: "String" },
                    { name: "originTime", type: "BigInt" },
                    { name: "notifyTime", type: "BigInt" },
                    { name: "accessEventId", type: "String" },
                    { name: "eventType", type: "String" },
                    { name: "eventName", type: "String" },
                    { name: "eventTime", type: "BigInt" },
                    { name: "eventUuid", type: "String" },
                    { name: "processed", type: "Boolean" },
                    { name: "createdAt", type: "DateTime" },
                ]
            },
        };

        const realDb = dbProxy.createDbContext(allowedModels);
        const modelNames = Object.keys(realDb);

        const rpcHandler = async (method: string, params: any) => {
            if (method === 'db.query') {
                const { model, method: dbMethod, args } = params;

                if (!realDb[model]) {
                    throw new Error(`Access denied to model ${model}`);
                }

                if (typeof realDb[model][dbMethod] !== 'function') {
                    throw new Error(`Method ${dbMethod} not found on model ${model}`);
                }

                return realDb[model][dbMethod](...args);
            }

            if (method === 'hardware.exec') {
                const { equipmentId, method: providerMethod, args: providerArgs } = params;
                const hardwareService = await this.getHardwareService();
                return await hardwareService.executeProviderAction(equipmentId, providerMethod, providerArgs);
            }

            throw new Error(`Unknown RPC method: ${method}`);
        };

        return {
            context: {
                instituicao,
                instituicaoCodigo,
                logsDir: join(__dirname, '..', '..', '..', 'logs'),
                adapters: {
                    equipamentos: equipamentos.map((eq) => ({
                        codigo: eq.EQPCodigo,
                        descricao: eq.EQPDescricao || '',
                        ip: eq.EQPEnderecoIp || '',
                        marca: eq.EQPMarca || '',
                        modelo: eq.EQPModelo || '',
                        ativo: eq.EQPAtivo,
                    })),
                },
                dbConfig: {
                    models: modelNames,
                    tables: schemaDefinition
                },
                request: requestData,
                manual: requestData?.manual || false,
            },
            rpcHandler
        };
    }
}
