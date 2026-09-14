import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { SentidoEquipamentoDto } from './dto/turma.dto';
import { TurmaAcessoService } from './turma-acesso.service';

/**
 * Área Interna / Área Externa e portais de sentido por equipamento (SpecControlId.md §3, §6, §8).
 * Registrado antes de TurmaController para `turma/sentido` não cair em `turma/:trmCodigo`.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/turma/sentido')
export class TurmaSentidoController {
  constructor(private readonly service: TurmaAcessoService) {}

  @Get()
  @RequirePermission('turma', 'read')
  listar(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
    return this.service.executar(instituicaoCodigo, (core) => core.listarEquipamentosSentido());
  }

  /** Lê do equipamento configuração da catraca, áreas e portais — não altera nada. */
  @Get(':eqpCodigo/leitura')
  @RequirePermission('turma', 'read')
  ler(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.lerSentidoEquipamento(eqpCodigo));
  }

  /** Cria (ou reconhece) as áreas e os portais de sentido e replica as regras gerais. */
  @Post(':eqpCodigo/preparar')
  @RequirePermission('turma', 'update')
  preparar(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Req() req: any,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.prepararSentidoEquipamento(eqpCodigo, { usuario: req.user?.userId }),
    );
  }

  /** Inverter portais (após teste em bancada) e marcar como validado. */
  @Put(':eqpCodigo')
  @RequirePermission('turma', 'update')
  atualizar(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Body() dto: SentidoEquipamentoDto,
    @Req() req: any,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.atualizarSentidoEquipamento(eqpCodigo, dto, { usuario: req.user?.userId }),
    );
  }
}
