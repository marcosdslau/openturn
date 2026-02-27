import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    ParseIntPipe,
    UseGuards,
} from '@nestjs/common';
import { ConnectorService } from './connector.service';
import { PairConnectorDto } from './dto/connector.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instituicao/:instituicaoCodigo/connector')
export class ConnectorController {
    constructor(private service: ConnectorService) { }

    @Post('pair')
    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN, GrupoAcesso.ADMIN)
    pair(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() dto: PairConnectorDto,
    ) {
        return this.service.pair(instituicaoCodigo, dto);
    }

    @Post('token')
    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN, GrupoAcesso.ADMIN)
    renewToken(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    ) {
        return this.service.renewToken(instituicaoCodigo);
    }

    @Get('status')
    @Roles(
        GrupoAcesso.SUPER_ROOT,
        GrupoAcesso.SUPER_ADMIN,
        GrupoAcesso.ADMIN,
        GrupoAcesso.GESTOR,
    )
    getStatus(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    ) {
        return this.service.getStatus(instituicaoCodigo);
    }

    @Delete('unpair')
    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN, GrupoAcesso.ADMIN)
    unpair(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    ) {
        return this.service.unpair(instituicaoCodigo);
    }
}
