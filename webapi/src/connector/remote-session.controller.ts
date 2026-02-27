import {
    Controller,
    Post,
    Delete,
    Param,
    ParseIntPipe,
    UseGuards,
    Req,
} from '@nestjs/common';
import { RemoteSessionService } from './remote-session.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instituicao/:instituicaoCodigo/equipamento/:equipId/remoto/sessoes')
export class RemoteSessionController {
    constructor(private service: RemoteSessionService) { }

    @Post()
    @Roles(
        GrupoAcesso.SUPER_ROOT,
        GrupoAcesso.SUPER_ADMIN,
        GrupoAcesso.ADMIN,
        GrupoAcesso.GESTOR,
    )
    createSession(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('equipId', ParseIntPipe) equipId: number,
        @Req() req: any,
    ) {
        const userId = req.user?.userId;
        return this.service.createSession(instituicaoCodigo, equipId, userId);
    }

    @Delete(':sessionId')
    @Roles(
        GrupoAcesso.SUPER_ROOT,
        GrupoAcesso.SUPER_ADMIN,
        GrupoAcesso.ADMIN,
        GrupoAcesso.GESTOR,
    )
    closeSession(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('equipId', ParseIntPipe) equipId: number,
        @Param('sessionId') sessionId: string,
    ) {
        return this.service.closeSession(instituicaoCodigo, equipId, sessionId);
    }
}
