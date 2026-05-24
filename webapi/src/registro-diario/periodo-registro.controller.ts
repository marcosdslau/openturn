import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { GrupoAcesso } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PeriodoRegistroService } from './periodo-registro.service';
import { CreatePeriodoRegistroDto, UpdatePeriodoRegistroDto } from './dto/periodo-registro.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
@Controller('instituicao/:instituicaoCodigo/periodos-registro')
export class PeriodoRegistroController {
  constructor(private readonly service: PeriodoRegistroService) {}

  @Get()
  findAll(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
    return this.service.findAll(instituicaoCodigo);
  }

  @Post()
  create(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: CreatePeriodoRegistroDto,
  ) {
    return this.service.create(instituicaoCodigo, dto);
  }

  @Put(':perCodigo')
  update(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('perCodigo', ParseIntPipe) perCodigo: number,
    @Body() dto: UpdatePeriodoRegistroDto,
  ) {
    return this.service.update(instituicaoCodigo, perCodigo, dto);
  }

  @Delete(':perCodigo')
  remove(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('perCodigo', ParseIntPipe) perCodigo: number,
  ) {
    return this.service.remove(instituicaoCodigo, perCodigo);
  }
}
