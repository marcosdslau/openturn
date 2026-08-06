import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { GrupoAcesso } from '@prisma/client';
import { CursosImplantacaoService } from './cursos-implantacao.service';
import { ReplaceCursosImplantacaoDto } from './cursos-implantacao.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
@Controller('instituicao/:instituicaoCodigo/cursos-implantacao')
export class CursosImplantacaoController {
  constructor(private readonly service: CursosImplantacaoService) {}

  @Get()
  findAll(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
    return this.service.findAll(instituicaoCodigo);
  }

  @Get('opcoes')
  opcoes(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
    return this.service.opcoes(instituicaoCodigo);
  }

  @Put()
  replace(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: ReplaceCursosImplantacaoDto,
  ) {
    return this.service.replace(instituicaoCodigo, dto.combinacoes);
  }
}
