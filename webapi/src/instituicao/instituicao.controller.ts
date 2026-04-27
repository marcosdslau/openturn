import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InstituicaoService } from './instituicao.service';
import {
  CreateInstituicaoDto,
  UpdateInstituicaoDto,
  SetWorkerStatusBodyDto,
} from './dto/instituicao.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instituicoes')
export class InstituicaoController {
  constructor(
    private service: InstituicaoService,
    private rotinaQueue: RotinaQueueService,
  ) {}

  @Roles(GrupoAcesso.SUPER_ROOT)
  @Post()
  create(@Body() dto: CreateInstituicaoDto) {
    return this.service.create(dto);
  }

  @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query);
  }

  @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
  @Post('worker/bulk')
  bulkWorkerStatus(@Body() body: SetWorkerStatusBodyDto) {
    return this.service.bulkUpdateWorkerStatus(body.active);
  }

  @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
  @Get('worker/inflight')
  async getWorkerInflight() {
    const items = await this.rotinaQueue.getInflightCounts();
    return { items };
  }

  @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
  @Patch(':id/worker')
  patchWorkerStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetWorkerStatusBodyDto,
  ) {
    return this.service.updateWorkerStatus(id, body.active);
  }

  @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
  @Post(':id/worker/inflight/reset')
  async resetWorkerInflight(@Param('id', ParseIntPipe) id: number) {
    await this.service.findOne(id);
    return this.rotinaQueue.resetInflightForInstitution(id);
  }

  @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstituicaoDto,
  ) {
    return this.service.update(id, dto);
  }

  @Roles(GrupoAcesso.SUPER_ROOT)
  @Patch(':id')
  patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstituicaoDto,
  ) {
    // Aproveita a mesma lógica do update (que já aceita partial no DTO)
    return this.service.update(id, dto);
  }

  @Roles(GrupoAcesso.SUPER_ROOT)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
