
import { Controller, Post, Body, Query, Headers, Param, Logger, ParseIntPipe } from '@nestjs/common';
import { HardwareService } from '../hardware.service';

@Controller('instituicao/:codigoInstituicao/monitor/controlid')
export class MonitorController {
    private readonly logger = new Logger(MonitorController.name);

    constructor(private readonly hardwareService: HardwareService) { }

    @Post('dao')
    async handleDao(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] DAO Notification received`);
        // Handle object changes if necessary (e.g. sync state updates)
        return {};
    }

    @Post('catra_event')
    async handleCatraEvent(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Catra Event received: ${JSON.stringify(body)}`);
        // Process access log
        if (body && body.event) {
            await this.hardwareService.processAccessLog(codigoInstituicao, body.event);
        }
        return {};
    }

    @Post('door')
    async handleDoor(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Door Event received`);
        return {};
    }

    @Post('operation_mode')
    async handleOperationMode(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Operation Mode Event received`);
        return {};
    }

    @Post('template')
    async handleTemplate(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Template Event received`);
        return {};
    }

    @Post('face_template')
    async handleFaceTemplate(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Face Template Event received`);
        return {};
    }

    @Post('card')
    async handleCard(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Card Event received`);
        return {};
    }

    @Post('user_image')
    async handleUserImage(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] User Image Event received`);
        // This is where enrollment photo arrives if save=false
        return {};
    }
}
