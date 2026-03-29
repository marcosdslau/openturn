import { Worker, Job } from 'bullmq';
import { PrismaClient, StatusExecucao } from '@prisma/client';
import Redis from 'ioredis';
import { WorkerProcessManager } from './engine/process-manager';
import { DbTenantProxy } from './engine/db-tenant-proxy';
import { join } from 'path';

export interface RotinaJobData {
    exeId: string;
    rotinaCodigo: number;
    instituicaoCodigo: number;
    trigger: 'SCHEDULE' | 'WEBHOOK';
    requestEnvelope?: any;
    enqueuedAt: string;
}

const ROTINA_QUEUE_NAME = 'rotina-execute';

const ALLOWED_MODELS = [
    'pESPessoa', 'mATMatricula', 'rEGRegistroPassagem',
    'eQPEquipamento', 'pESEquipamentoMapeamento', 'eRPConfiguracao', 'iNSInstituicao',
];

const SCHEMA_DEFINITION = {
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
    }
};

export function startConsumer(prisma: PrismaClient, processManager: WorkerProcessManager, redisUrl: string) {
    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

    const worker = new Worker<RotinaJobData>(
        ROTINA_QUEUE_NAME,
        async (job: Job<RotinaJobData>) => {
            const { exeId, rotinaCodigo, instituicaoCodigo, trigger, requestEnvelope } = job.data;
            console.log(`[Worker] Processing job ${job.id} (rotina=${rotinaCodigo}, trigger=${trigger})`);

            const rotina = await prisma.rOTRotina.findFirst({
                where: { ROTCodigo: rotinaCodigo, INSInstituicaoCodigo: instituicaoCodigo },
                include: { instituicao: true },
            });

            if (!rotina) {
                await updateExecLog(prisma, exeId, StatusExecucao.ERRO, 'Rotina não encontrada');
                throw new Error('Rotina não encontrada');
            }

            const { context, rpcHandler } = buildContext(prisma, instituicaoCodigo, requestEnvelope);

            const result = await processManager.executeInProcess(
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
            await prisma.rOTExecucaoLog.updateMany({
                where: { EXEIdExterno: exeId },
                data: {
                    EXEStatus: finalStatus,
                    EXEFim: fim,
                    EXEDuracaoMs: result.duration,
                    EXEResultado: result.result ?? undefined,
                    EXEErro: result.error,
                    EXELogs: result.logs as any,
                },
            });

            await prisma.rOTRotina.update({
                where: { ROTCodigo: rotinaCodigo },
                data: { ROTUltimaExecucao: fim },
            });

            return {
                success: result.success,
                result: result.result,
                error: result.error,
                duration: result.duration,
            };
        },
        {
            connection: parseRedisUrl(redisUrl),
            concurrency,
        },
    );

    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed:`, err.message);
    });

    worker.on('completed', (job) => {
        console.log(`[Worker] Job ${job.id} completed`);
    });

    // Cancel listener via Redis pub/sub
    const redisSub = new Redis(redisUrl);
    redisSub.subscribe('rotina:cancel');
    redisSub.on('message', (_channel: string, message: string) => {
        try {
            const { exeId } = JSON.parse(message);
            if (exeId) {
                processManager.killProcess(exeId);
            }
        } catch { /* ignore malformed */ }
    });

    console.log(`[Worker] Consumer started (concurrency=${concurrency})`);
    return worker;
}

function buildContext(prisma: PrismaClient, instituicaoCodigo: number, requestData?: any) {
    const dbProxy = new DbTenantProxy(prisma, instituicaoCodigo);
    const realDb = dbProxy.createDbContext(ALLOWED_MODELS);
    const modelNames = Object.keys(realDb);

    const rpcHandler = async (method: string, params: any) => {
        if (method === 'db.query') {
            const { model, method: dbMethod, args } = params;
            if (!realDb[model]) throw new Error(`Access denied to model ${model}`);
            if (typeof realDb[model][dbMethod] !== 'function') throw new Error(`Method ${dbMethod} not found on model ${model}`);
            return realDb[model][dbMethod](...args);
        }
        throw new Error(`Unknown RPC method: ${method}`);
    };

    return {
        context: {
            instituicaoCodigo,
            logsDir: join(__dirname, '..', 'logs'),
            adapters: { equipamentos: [] },
            dbConfig: { models: modelNames, tables: SCHEMA_DEFINITION },
            request: requestData,
            manual: false,
        },
        rpcHandler,
    };
}

async function updateExecLog(prisma: PrismaClient, exeId: string, status: StatusExecucao, error?: string) {
    await prisma.rOTExecucaoLog.updateMany({
        where: { EXEIdExterno: exeId },
        data: {
            EXEStatus: status,
            EXEFim: new Date(),
            EXEErro: error,
        },
    });
}

function parseRedisUrl(url: string): { host: string; port: number } {
    try {
        const parsed = new URL(url);
        return { host: parsed.hostname, port: parseInt(parsed.port || '6379', 10) };
    } catch {
        return { host: 'localhost', port: 6379 };
    }
}
