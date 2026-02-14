import { Controller, Get, Put, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ERPConfigService } from './erp-config.service';
import { UpdateERPConfigDto } from './erp-config.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
@Controller('instituicoes/:id/erp-config')
export class ERPConfigController {
    constructor(private service: ERPConfigService) { }

    @Get()
    get(@Param('id', ParseIntPipe) id: number) {
        return this.service.findByInstituicao(id);
    }

    @Put()
    upsert(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateERPConfigDto,
    ) {
        return this.service.upsert(id, dto);
    }
}
