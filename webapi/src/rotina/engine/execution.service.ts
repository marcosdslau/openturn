import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProcessManager } from './process-manager';
import { DbTenantProxy } from './db-tenant-proxy';
import { ConsoleGateway } from '../console.gateway';
import { StatusExecucao } from '@prisma/client';

@Injectable()
export class ExecutionService {
    private readonly logger = new Logger(ExecutionService.name);
    private readonly processManager: ProcessManager;

    constructor(
        private readonly prisma: PrismaService,
        private readonly consoleGateway: ConsoleGateway,
    ) {
        this.processManager = new ProcessManager();
        this.processManager.setConsoleGateway(consoleGateway);
    }

    /**
     * Executa uma rotina
     */
    async execute(
        rotinaCodigo: number,
        instituicaoCodigo: number,
        trigger: string,
        requestData?: any,
    ) {
        const executionId = `exec-${rotinaCodigo}-${Date.now()}`;
        const inicio = new Date();

        try {
            // Busca rotina
            const rotina = await this.prisma.rOTRotina.findFirst({
                where: {
                    ROTCodigo: rotinaCodigo,
                    INSInstituicaoCodigo: instituicaoCodigo,
                },
                include: {
                    instituicao: true,
                },
            });

            if (!rotina) {
                throw new Error('Rotina não encontrada');
            }

            if (!rotina.ROTAtivo) {
                throw new Error('Rotina inativa');
            }

            // Prepara contexto e handler RPC
            const { context, rpcHandler } = await this.buildContext(instituicaoCodigo, requestData);

            // Executa em processo filho
            const result = await this.processManager.executeInProcess(
                executionId,
                rotinaCodigo,
                rotina.ROTCodigoJS,
                context,
                rotina.ROTTimeoutSeconds,
                rpcHandler,
            );

            // Grava log de execução
            await this.logExecution({
                rotinaCodigo,
                instituicaoCodigo,
                status: result.timedOut
                    ? StatusExecucao.TIMEOUT
                    : result.success
                        ? StatusExecucao.SUCESSO
                        : StatusExecucao.ERRO,
                inicio,
                fim: new Date(),
                duracaoMs: result.duration,
                resultado: result.result,
                erro: result.error,
                trigger,
                requestData,
            });

            // Atualiza última execução
            await this.prisma.rOTRotina.update({
                where: { ROTCodigo: rotinaCodigo },
                data: { ROTUltimaExecucao: new Date() },
            });

            return {
                success: result.success,
                result: result.result,
                error: result.error,
                duration: result.duration,
                timedOut: result.timedOut,
            };
        } catch (error: any) {
            this.logger.error(`Execution error for ${executionId}:`, error);

            // Grava log de erro
            await this.logExecution({
                rotinaCodigo,
                instituicaoCodigo,
                status: StatusExecucao.ERRO,
                inicio,
                fim: new Date(),
                duracaoMs: Date.now() - inicio.getTime(),
                erro: error.message,
                trigger,
                requestData,
            });

            throw error;
        }
    }

    /**
     * Constrói o contexto de execução
     */
    private async buildContext(instituicaoCodigo: number, requestData?: any) {
        // Busca instituição
        const instituicao = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
        });

        // Busca equipamentos ativos
        const equipamentos = await this.prisma.eQPEquipamento.findMany({
            where: {
                INSInstituicaoCodigo: instituicaoCodigo,
                EQPAtivo: true,
            },
        });

        // Cria proxy de DB com RLS
        const dbProxy = new DbTenantProxy(this.prisma, instituicaoCodigo);
        const allowedModels = [
            'pESPessoa',
            'mATMatricula',
            'rEGRegistroPassagem',
            'eQPEquipamento',
        ];

        // Schema definition for context info (mirrors schema.prisma minus INSInstituicaoCodigo)
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
            }
        };

        // Objeto DB real (com Proxies do Prisma) - Fica no processo PAI
        const realDb = dbProxy.createDbContext(allowedModels);

        // Identifica os nomes dos modelos camelCase (ex: pessoa, matricula)
        const modelNames = Object.keys(realDb);

        // Handler RPC para executar chamadas de DB do filho no pai
        const rpcHandler = async (method: string, params: any) => {
            if (method === 'db.query') {
                const { model, method: dbMethod, args } = params;

                if (!realDb[model]) {
                    throw new Error(`Access denied to model ${model}`);
                }

                if (typeof realDb[model][dbMethod] !== 'function') {
                    throw new Error(`Method ${dbMethod} not found on model ${model}`);
                }

                // Executa no Prisma real
                return realDb[model][dbMethod](...args);
            }
            throw new Error(`Unknown RPC method: ${method}`);
        };

        return {
            context: {
                instituicao,
                adapters: {
                    equipamentos: equipamentos.map((eq) => ({
                        codigo: eq.EQPCodigo,
                        descricao: eq.EQPDescricao || '',
                        ip: eq.EQPEnderecoIp || '',
                        marca: eq.EQPMarca || '',
                        modelo: eq.EQPModelo || '',
                        ativo: eq.EQPAtivo,
                        // TODO: Adicionar métodos de controle (unlock, etc)
                    })),
                },
                // NÃO enviamos o objeto db real, pois contém referências circulares
                dbConfig: {
                    models: modelNames,
                    tables: schemaDefinition // Expondo lista de tabelas para o scripter (leitura)
                },
                request: requestData,
                manual: requestData?.manual || false,
            },
            rpcHandler
        };
    }

    /**
     * Grava log de execução
     */
    private async logExecution(data: {
        rotinaCodigo: number;
        instituicaoCodigo: number;
        status: StatusExecucao;
        inicio: Date;
        fim: Date;
        duracaoMs: number;
        resultado?: any;
        erro?: string;
        trigger: string;
        requestData?: any;
    }) {
        return this.prisma.rOTExecucaoLog.create({
            data: {
                ROTCodigo: data.rotinaCodigo,
                INSInstituicaoCodigo: data.instituicaoCodigo,
                EXEStatus: data.status,
                EXEInicio: data.inicio,
                EXEFim: data.fim,
                EXEDuracaoMs: data.duracaoMs,
                EXEResultado: data.resultado,
                EXEErro: data.erro,
                EXETrigger: data.trigger,
                EXERequestBody: data.requestData?.body,
                EXERequestParams: data.requestData?.params,
                EXERequestPath: data.requestData?.path,
            },
        });
    }
}
