import { Controller, All, Param, Body, Query, Headers, Req, Res, NotFoundException, UnauthorizedException, Logger, HttpCode } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { RotinaQueueService } from './queue/rotina-queue.service';
import { QueueEvents } from 'bullmq';

@Controller('instituicoes/:instituicaoCodigo/webhooks')
export class RotinaWebhookController {
    private readonly logger = new Logger(RotinaWebhookController.name);
    private queueEvents: QueueEvents | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly rotinaQueueService: RotinaQueueService,
    ) {
        this.initQueueEvents();
    }

    private initQueueEvents() {
        try {
            this.queueEvents = new QueueEvents('rotina-execute', {
                connection: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT || '6379', 10),
                },
            });
        } catch (err) {
            this.logger.warn('QueueEvents could not be initialized (Redis may not be available)');
        }
    }

    @All(':path')
    async handleWebhook(
        @Param('instituicaoCodigo') instituicaoCodigoStr: string,
        @Param('path') path: string,
        @Body() body: any,
        @Query() query: any,
        @Headers() headers: any,
        @Req() req: any,
        @Res() res: Response,
    ) {
        const method = req.method;

        const rotina = await this.prisma.rOTRotina.findFirst({
            where: {
                ROTWebhookPath: `/${path}`,
                INSInstituicaoCodigo: parseInt(instituicaoCodigoStr, 10),
                ROTWebhookMetodo: method,
            },
        });

        if (!rotina) {
            throw new NotFoundException('Webhook not found');
        }

        if (!rotina.ROTAtivo) {
            this.logger.debug(`Webhook recebido para rotina inativa ${rotina.ROTCodigo}. Ignorando.`);
            return res.json({ message: 'Routine is paused', status: 'skipped' });
        }

        if (rotina.ROTWebhookMetodo && rotina.ROTWebhookMetodo !== method) {
            throw new NotFoundException(`Method ${method} not allowed`);
        }

        if (rotina.ROTWebhookSeguro && rotina.ROTWebhookToken) {
            const tokenKey = rotina.ROTWebhookTokenKey || 'x-webhook-token';
            const tokenSource = rotina.ROTWebhookTokenSource || 'HEADER';

            let receivedToken: string | undefined;

            if (tokenSource === 'HEADER') {
                receivedToken = headers[tokenKey.toLowerCase()];
            } else if (tokenSource === 'QUERY') {
                receivedToken = query[tokenKey];
            }

            if (receivedToken !== rotina.ROTWebhookToken) {
                this.logger.warn(`Tentativa de acesso não autorizado ao webhook ${path}. Fonte: ${tokenSource}, Chave: ${tokenKey}`);
                throw new UnauthorizedException('Invalid token');
            }
        }

        const requestData = {
            body,
            query,
            headers,
            method,
            path: `/${path}`,
            params: req.params,
        };

        const { exeId } = await this.rotinaQueueService.enqueue(
            rotina.ROTCodigo,
            rotina.INSInstituicaoCodigo,
            'WEBHOOK',
            requestData,
        );

        if (rotina.ROTWebhookAguardar) {
            try {
                if (!this.queueEvents) {
                    this.initQueueEvents();
                }

                const job = await (await import('bullmq')).Queue.prototype.getJob?.call(
                    null, exeId
                );

                const { Queue } = await import('bullmq');
                const queue = new Queue('rotina-execute', {
                    connection: {
                        host: process.env.REDIS_HOST || 'localhost',
                        port: parseInt(process.env.REDIS_PORT || '6379', 10),
                    },
                });

                const queueJob = await queue.getJob(exeId);
                if (queueJob && this.queueEvents) {
                    const timeoutMs = (rotina.ROTTimeoutSeconds + 10) * 1000;
                    const result = await queueJob.waitUntilFinished(this.queueEvents, timeoutMs);
                    await queue.close();
                    return res.json(result?.result ?? result);
                }

                await queue.close();
                return res.json({ exeId, message: 'Webhook enqueued (sync fallback)' });
            } catch (err: any) {
                this.logger.error(`Erro ao aguardar webhook síncrono ${path}:`, err);
                return res.status(500).json({ error: err.message, exeId });
            }
        }

        return res.status(202).json({ message: 'Webhook received', exeId, execution: 'queued' });
    }
}
