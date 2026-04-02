import { Controller, All, Param, Body, Query, Headers, Req, Res, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { RotinaQueueService } from './queue/rotina-queue.service';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';

@Controller('instituicoes/:instituicaoCodigo/webhooks')
export class RotinaWebhookController {
    private readonly logger = new Logger(RotinaWebhookController.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly rotinaQueueService: RotinaQueueService,
    ) { }

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
                const timeoutMs = (rotina.ROTTimeoutSeconds + 10) * 1000;
                const result = await this.waitForResultViaRedis(exeId, timeoutMs);
                return res.json(result?.result ?? result);
            } catch (err: any) {
                this.logger.error(`Erro ao aguardar webhook síncrono ${path}:`, err);
                return res.status(500).json({ error: err.message, exeId });
            }
        }

        return res.status(202).json({ message: 'Webhook received', exeId, execution: 'queued' });
    }

    private async waitForResultViaRedis(exeId: string, timeoutMs: number): Promise<any> {
        const channel = `rotina:finished:${exeId}`;
        const sub = new Redis({ ...getRedisConnectionOptions(), lazyConnect: true });
        await sub.connect();
        await sub.subscribe(channel);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(async () => {
                try {
                    await sub.unsubscribe(channel);
                    await sub.quit();
                } catch {
                    // ignore close errors
                }
                reject(new Error('Timeout aguardando retorno da execução'));
            }, timeoutMs);

            sub.on('message', async (receivedChannel, message) => {
                if (receivedChannel !== channel) return;
                clearTimeout(timeout);
                try {
                    const parsed = JSON.parse(message);
                    resolve(parsed);
                } catch {
                    resolve({ raw: message });
                } finally {
                    await sub.unsubscribe(channel);
                    await sub.quit();
                }
            });
        });
    }
}
