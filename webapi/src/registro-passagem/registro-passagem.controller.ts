import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  UseGuards,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { RegistroPassagemService } from './registro-passagem.service';
import {
  CreatePassagemDto,
  QueryPassagemDto,
  UpdatePassagemDto,
} from './dto/passagem.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/passagem')
export class RegistroPassagemController {
  constructor(private service: RegistroPassagemService) {}

  @Post()
  @RequirePermission('passagem', 'create')
  create(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: CreatePassagemDto,
  ) {
    return this.service.create(instituicaoCodigo, dto);
  }

  @Get()
  @RequirePermission('passagem', 'read')
  findAll(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Query() query: QueryPassagemDto,
  ) {
    return this.service.findAll(instituicaoCodigo, query);
  }

  @Patch(':id')
  @RequirePermission('passagem', 'update')
  update(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePassagemDto,
  ) {
    return this.service.update(instituicaoCodigo, id, dto);
  }

  @Delete(':id')
  @RequirePermission('passagem', 'delete')
  remove(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.remove(instituicaoCodigo, id);
  }
}
