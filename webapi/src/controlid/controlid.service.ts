import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StatusComando, AcaoPassagem } from '@prisma/client';

@Injectable()
export class ControlidService {
    private readonly logger = new Logger(ControlidService.name);

    constructor(private prisma: PrismaService) { }

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
     * Monitor (catra_event): registra passagem pela catraca
     */
    async registrarPassagem(body: any) {
        const deviceId = body.device_id;
        const userId = body.user_id;
        const time = body.time;
        const event = body.event;

        const equipamento = await this.prisma.eQPEquipamento.findFirst({
            where: { EQPCodigo: Number(deviceId) },
        });

        if (!equipamento) {
            this.logger.warn(`Device ${deviceId} not found, ignoring catra_event`);
            return;
        }

        const pessoa = await this.prisma.pESPessoa.findFirst({
            where: { PESCodigo: Number(userId) },
        });

        if (!pessoa) {
            this.logger.warn(`User ${userId} not found for device ${deviceId}, ignoring catra_event`);
            return;
        }

        const dataHora = time ? new Date(Number(time) * 1000) : new Date();
        // event 7 = clockwise (ENTRADA), 8 = anticlockwise (SAIDA)
        const acao = event === 8 ? AcaoPassagem.SAIDA : AcaoPassagem.ENTRADA;

        await this.prisma.rEGRegistroPassagem.create({
            data: {
                PESCodigo: pessoa.PESCodigo,
                REGAcao: acao,
                EQPCodigo: equipamento.EQPCodigo,
                REGTimestamp: BigInt(time || Math.floor(Date.now() / 1000)),
                REGDataHora: dataHora,
                INSInstituicaoCodigo: equipamento.INSInstituicaoCodigo,
            },
        });

        this.logger.log(`Passagem registrada: Pessoa ${pessoa.PESCodigo} - ${acao} - Device ${deviceId}`);
    }

    /**
     * Online (new_user_identified): valida e decide acesso em tempo real
     */
    async validarAcessoOnline(body: any) {
        const userId = body.user_id;
        const deviceId = body.device_id;

        const pessoa = await this.prisma.pESPessoa.findFirst({
            where: { PESCodigo: Number(userId) },
        });

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
        const equipamento = await this.prisma.eQPEquipamento.findFirst({
            where: { EQPCodigo: Number(deviceId) },
        });

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
