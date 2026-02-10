import { Controller, Get, Post, Body, Query, Headers, Logger } from '@nestjs/common';
import { CatracaService } from './catraca.service';

@Controller('catraca/controlid')
export class CatracaController {
    private readonly logger = new Logger(CatracaController.name);

    constructor(private readonly catracaService: CatracaService) { }

    /**
     * MODO PUSH: Equipamento consulta comandos pendentes
     * O equipamento faz essa requisição periodicamente.
     */
    @Get('push')
    getPush(@Query('deviceId') deviceId: string) {
        this.logger.log(`Push query from device: ${deviceId}`);
        // TODO: Buscar comandos na fila para este deviceId
        return {}; // Resposta vazia significa "sem comandos"
    }

    /**
     * MODO PUSH: Resultado da execução de um comando
     */
    @Post('result')
    postResult(@Body() body: any, @Query('deviceId') deviceId: string) {
        this.logger.log(`Result from device ${deviceId}: ${JSON.stringify(body)}`);
        return { result: 'ok' };
    }

    /**
     * MODO ONLINE: Identificação de usuário em tempo real
     * O equipamento envia os dados e aguarda a decisão do servidor.
     */
    @Post('new_user_identified.fcgi')
    async newUserIdentified(@Body() body: any) {
        this.logger.log(`Online Identification attempt: ${JSON.stringify(body)}`);

        // TODO: Lógica de validação de regra de acesso (Horário, Pagamento, etc)
        return {
            result: {
                event: 7, // 7 = Acesso autorizado
                user_name: body.user_name || 'Usuário',
                user_id: body.user_id,
                actions: [
                    {
                        action: 'door', // Ou 'catra' dependendo do modelo configurado
                        parameters: 'door=1',
                    },
                ],
                message: 'Acesso Liberado (OpenTurn)',
            },
        };
    }

    /**
     * MODO MONITOR: Notificação de giro de catraca ou evento de porta
     */
    @Post('api/notifications/catra_event')
    catraEvent(@Body() body: any) {
        this.logger.log(`Catra Event (Monitor): ${JSON.stringify(body)}`);
        // TODO: Persistir log de acesso no banco de dados
        return {};
    }

    @Post('api/notifications/door')
    doorEvent(@Body() body: any) {
        this.logger.log(`Door Event (Monitor): ${JSON.stringify(body)}`);
        return {};
    }

    /**
     * MODO MONITOR: Notificação de alteração de objetos (DAO)
     */
    @Post('api/notifications/dao')
    daoNotification(@Body() body: any) {
        this.logger.log(`DAO Notification: ${JSON.stringify(body)}`);
        return {};
    }
}
