import {
  Controller,
  Get,
  Patch,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { QueryNotificacaoDto } from './dto/notificacao.dto';
import { NotificacaoService } from './notificacao.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/notificacoes')
export class NotificacaoController {
  constructor(private readonly service: NotificacaoService) {}

  @Get()
  @RequirePermission('notificacao', 'read')
  findAll(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Query() query: QueryNotificacaoDto,
  ) {
    return this.service.findAll(instituicaoCodigo, query);
  }

  @Get('lido/:lido')
  @RequirePermission('notificacao', 'read')
  findByLido(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('lido', ParseBoolPipe) lido: boolean,
    @Query() query: PaginationDto,
  ) {
    return this.service.findAll(instituicaoCodigo, { ...query, lido });
  }

  @Patch(':id/lido')
  @RequirePermission('notificacao', 'update')
  markAsRead(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.markAsRead(instituicaoCodigo, id);
  }
}
