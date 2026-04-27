import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsuarioService } from './usuario.service';
import {
  CreateUsuarioDto,
  UpdateUsuarioDto,
  CreateAcessoDto,
} from './dto/usuario.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/usuario')
export class InstituicaoUsuarioController {
  constructor(private service: UsuarioService) {}

  @Post()
  @RequirePermission('usuario_instituicao', 'create')
  create(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: CreateUsuarioDto,
  ) {
    return this.service.create(instituicaoCodigo, dto);
  }

  @Get()
  @RequirePermission('usuario_instituicao', 'read')
  findAll(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Query() query: PaginationDto,
  ) {
    return this.service.findAll(instituicaoCodigo, query);
  }

  @Get(':id')
  @RequirePermission('usuario_instituicao', 'read')
  findOne(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(instituicaoCodigo, id);
  }

  @Patch(':id')
  @RequirePermission('usuario_instituicao', 'update')
  update(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUsuarioDto,
  ) {
    return this.service.update(instituicaoCodigo, id, dto);
  }

  @Delete(':id')
  @RequirePermission('usuario_instituicao', 'delete')
  remove(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.service.remove(instituicaoCodigo, id, req.user?.acessos);
  }

  @Post(':id/acessos')
  @RequirePermission('usuario_instituicao', 'update')
  addAcesso(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAcessoDto,
    @Request() req: any,
  ) {
    return this.service.addAcesso(instituicaoCodigo, id, dto, req.user.acessos);
  }

  @Delete('acessos/:acessoId')
  @RequirePermission('usuario_instituicao', 'delete')
  removeAcesso(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('acessoId', ParseIntPipe) acessoId: number,
    @Request() req: any,
  ) {
    return this.service.removeAcesso(
      instituicaoCodigo,
      acessoId,
      req.user?.acessos,
    );
  }
}
