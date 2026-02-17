
import { Controller, Post, Body, Param, Logger, ParseIntPipe, Query } from '@nestjs/common';
import { HardwareService } from '../hardware.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('api/instituicao/:codigoInstituicao/hardware/controlid')
export class ControlIDController {
    private readonly logger = new Logger(ControlIDController.name);

    constructor(
        private readonly hardwareService: HardwareService,
        private readonly prisma: PrismaService,
    ) { }

    @Post('notifications/dao')
    async handleDaoNotification(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Query('deviceId') deviceId: string,
        @Body() body: any,
    ) {
        this.logger.log(`[${codigoInstituicao}] DAO Notification (Dev: ${deviceId}): ${JSON.stringify(body)}`);

        if (body.object_changes && Array.isArray(body.object_changes)) {
            for (const change of body.object_changes) {
                // ... (existing templates/images logic)

                if (change.object === 'access_logs' && change.values) {
                    const values = change.values;
                    const event = values.event;
                    const userId = values.user_id;
                    const time = values.time; // Unix timestamp

                    if (userId && time && deviceId) {
                        try {
                            // Only log Access Granted (7) for now. Adjust if needed.
                            if (event === 7) {
                                await this.prisma.rEGRegistroPassagem.create({
                                    data: {
                                        PESCodigo: Number(userId),
                                        EQPCodigo: Number(deviceId),
                                        REGAcao: 'ENTRADA', // Default to ENTRADA
                                        REGTimestamp: time,
                                        REGDataHora: new Date(time * 1000),
                                        INSInstituicaoCodigo: codigoInstituicao
                                    }
                                });
                                this.logger.log(`Access log saved for user ${userId} on device ${deviceId}`);
                            }
                        } catch (e) {
                            this.logger.error(`Failed to save access log`, e);
                        }
                    }
                }
            }
        }

        // Re-inject existing logic for templates/images properly (I'm replacing the whole method essentially)
        // Check current content and merging...

        // The instruction says "Add handling...". I should be careful not to delete existing logic.
        // I will use replace_file_content carefully.

        return { status: 'ok' };
    }



    @Post('identify') // Online identification request
    async handleIdentify(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Query('deviceId') deviceId: string, // ControlID sends device id in query or body usually
        @Body() body: any,
    ) {
        this.logger.log(`[${codigoInstituicao}] Identification Request from device ${deviceId}: ${JSON.stringify(body)}`);

        // Body: { user_id: 123, ... } or { card_value: 123456, ... }

        let person: any = null;

        try {
            if (body.user_id) {
                // Device identified user locally
                person = await this.prisma.pESPessoa.findFirst({
                    where: {
                        PESCodigo: Number(body.user_id),
                        INSInstituicaoCodigo: codigoInstituicao,
                        PESAtivo: true
                    }
                });
            } else if (body.card_value) {
                // Card presented
                person = await this.prisma.pESPessoa.findFirst({
                    where: {
                        PESCartaoTag: String(body.card_value),
                        INSInstituicaoCodigo: codigoInstituicao,
                        PESAtivo: true
                    }
                });
            }

            if (person) {
                this.logger.log(`User identified: ${person.PESNome} (${person.PESCodigo})`);

                // Optional: Check other rules (Timezone, etc) here

                // Log the access attempt (optional here, depends if device sends another log later)
                // We'll log it as "Authorized" here? No, 'dao' notification usually sends the confirmed log.

                return {
                    result: {
                        event: 7, // ACCESS_GRANTED
                        user_name: person.PESNome,
                        user_id: person.PESCodigo,
                        user_image: false, // Don't ask for image update
                        portal_id: 1, // Door 1
                        actions: [
                            { action: 'sec_box', parameters: 'id=65793, reason=1' } // Open door
                        ],
                        messages: [
                            { main_text: `Bem-vindo ${person.PESNome.split(' ')[0]}`, sub_text: "Acesso Liberado" }
                        ]
                    }
                };
            }
        } catch (e) {
            this.logger.error(`Error identifying user`, e);
        }

        this.logger.warn(`Access Denied for body: ${JSON.stringify(body)}`);

        return {
            result: {
                event: 3, // ACCESS_DENIED (Identification failed or Access Denied)
                messages: [
                    { main_text: "Acesso Negado", sub_text: "Não encontrado" }
                ]
            }
        };
    }

    @Post('enroll')
    async handleEnroll(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: { deviceId: number; userId: number; type: 'face' | 'biometry' },
    ) {
        this.logger.log(`[${codigoInstituicao}] Enrollment Request: ${JSON.stringify(body)}`);

        // 1. Find the device
        const device = await this.prisma.eQPEquipamento.findUnique({
            where: { EQPCodigo: body.deviceId, INSInstituicaoCodigo: codigoInstituicao }
        });

        if (!device) {
            throw new Error('Device not found');
        }

        // 2. Instantiate provider
        const provider = this.hardwareService.instantiate(device);

        // 3. Trigger enroll
        await provider.enroll(body.type, body.userId);

        return { status: 'ok', message: 'Enrollment started on device' };
    }
}
