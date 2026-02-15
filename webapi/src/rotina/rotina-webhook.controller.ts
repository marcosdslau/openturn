import { Controller, All, Param, Body, Query, Headers, Req, NotFoundException, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExecutionService } from './engine/execution.service';

@Controller('webhooks')
export class RotinaWebhookController {
    private readonly logger = new Logger(RotinaWebhookController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly executionService: ExecutionService,
    ) { }

    @All(':path')
    async handleWebhook(
        @Param('path') path: string,
        @Body() body: any,
        @Query() query: any,
        @Headers() headers: any,
        @Req() req: any,
    ) {
        const method = req.method;

        // Busca rotina pelo path (case sensitive ou não? vamos assumir exact match)
        const rotina = await this.prisma.rOTRotina.findFirst({
            where: {
                ROTWebhookPath: `/${path}`,
            },
        });

        if (!rotina) {
            throw new NotFoundException('Webhook not found');
        }

        // Validação Play/Stop
        if (!rotina.ROTAtivo) {
            this.logger.debug(`Webhook recebido para rotina inativa ${rotina.ROTCodigo}. Ignorando.`);
            return { message: 'Routine is paused', status: 'skipped' };
        }

        // Validação de Método HTTP (se configurado)
        if (rotina.ROTWebhookMetodo && rotina.ROTWebhookMetodo !== method) {
            throw new NotFoundException(`Method ${method} not allowed`);
        }

        // Validação de Token de Segurança (se configurado)
        if (rotina.ROTWebhookSeguro && rotina.ROTWebhookToken) {
            const tokenKey = rotina.ROTWebhookTokenKey || 'x-webhook-token';
            // Fonte do token (padrão HEADER se nulo)
            const tokenSource = rotina.ROTWebhookTokenSource || 'HEADER';

            let receivedToken: string | undefined;

            if (tokenSource === 'HEADER') {
                // Headers no node/express são lowercase
                receivedToken = headers[tokenKey.toLowerCase()];
            } else if (tokenSource === 'QUERY') {
                receivedToken = query[tokenKey];
            }

            if (receivedToken !== rotina.ROTWebhookToken) {
                this.logger.warn(`Tentativa de acesso não autorizado ao webhook ${path}. Fonte: ${tokenSource}, Chave: ${tokenKey}`);
                throw new UnauthorizedException('Invalid token');
            }
        }

        // Executa a rotina
        // Nota: Webhooks rodam em "Fire and Forget" ou esperamos o resultado?
        // Geralmente webhooks devem responder rápido. Vamos disparar sem awaitar o resultado final
        // mas garantindo que o erro de start seja capturado.

        this.executionService.execute(
            rotina.ROTCodigo,
            rotina.INSInstituicaoCodigo,
            'WEBHOOK',
            {
                body,
                query,
                headers,
                method,
            }
        ).catch(err => {
            this.logger.error(`Erro ao executar webhook ${path}:`, err);
        });

        return { message: 'Webhook received', execution: 'started' };
    }
}
