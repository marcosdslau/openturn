import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import {
  AreaNomeDto,
  DepartamentoAdotarDto,
  DepartamentoCriarDto,
  DepartamentoNomeDto,
  HorarioAtualizarDto,
  HorarioCriarDto,
  PortalCriarDto,
  RegrasDepartamentoDto,
} from './dto/acesso-equipamento.dto';
import { TurmaAcessoService } from './turma-acesso.service';

/**
 * Configuração de acesso de um equipamento: áreas, portais, horários e departamentos
 * (docs/controle-por-turma/PLANO-IMPLEMENTACAO.md §5).
 *
 * O equipamento é a fonte da verdade: toda escrita grava nele e, em seguida, relê o equipamento
 * inteiro para reconciliar o espelho. Por isso toda rota de escrita devolve `espelho` já
 * atualizado — a tela não precisa reconsultar.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/equipamento/:eqpCodigo/acesso')
export class EquipamentoAcessoController {
  constructor(private readonly service: TurmaAcessoService) {}

  /** Espelho gravado. Não fala com o equipamento. */
  @Get()
  @RequirePermission('equipamento', 'read')
  obter(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.obterEspelhoEquipamento(eqpCodigo));
  }

  /**
   * Compara a configuração de acesso host a host. Responde se os leitores faciais têm banco de
   * objetos próprio ou se compartilham o da catraca — o espelho assume que compartilham.
   */
  @Post('comparar-hosts')
  @RequirePermission('equipamento', 'read')
  compararHosts(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.compararHostsEquipamento(eqpCodigo));
  }

  /** Relê a configuração do equipamento e reconcilia o espelho. Só leitura no hardware. */
  @Post('ler')
  @RequirePermission('equipamento', 'update')
  ler(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.lerConfiguracaoEquipamento(eqpCodigo));
  }

  // ── áreas ──────────────────────────────────────────────────────────────

  @Post('area')
  @RequirePermission('equipamento', 'update')
  criarArea(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Body() dto: AreaNomeDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.criarAreaEquipamento(eqpCodigo, dto.nome));
  }

  @Put('area/:areCodigo')
  @RequirePermission('equipamento', 'update')
  renomearArea(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Param('areCodigo', ParseIntPipe) areCodigo: number,
    @Body() dto: AreaNomeDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.renomearAreaEquipamento(eqpCodigo, areCodigo, dto.nome),
    );
  }

  // ── portais ────────────────────────────────────────────────────────────

  /** O portal é a aresta dirigida entre duas áreas — é ele que carrega o sentido. */
  @Post('portal')
  @RequirePermission('equipamento', 'update')
  criarPortal(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Body() dto: PortalCriarDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.criarPortalEquipamento(eqpCodigo, dto));
  }

  // ── horários ───────────────────────────────────────────────────────────

  @Post('horario')
  @RequirePermission('equipamento', 'update')
  criarHorario(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Body() dto: HorarioCriarDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.criarHorarioEquipamento(eqpCodigo, dto));
  }

  @Put('horario/:horCodigo')
  @RequirePermission('equipamento', 'update')
  atualizarHorario(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Param('horCodigo', ParseIntPipe) horCodigo: number,
    @Body() dto: HorarioAtualizarDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.atualizarHorarioEquipamento(eqpCodigo, horCodigo, dto),
    );
  }

  @Delete('horario/:horCodigo')
  @RequirePermission('equipamento', 'update')
  removerHorario(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Param('horCodigo', ParseIntPipe) horCodigo: number,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.removerHorarioEquipamento(eqpCodigo, horCodigo));
  }

  // ── departamentos ──────────────────────────────────────────────────────

  /** Cria o departamento no equipamento e já o adota. */
  @Post('departamento')
  @RequirePermission('equipamento', 'update')
  criarDepartamento(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Body() dto: DepartamentoCriarDto,
    @Req() req: any,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.criarDepartamentoEquipamento(eqpCodigo, dto, { usuario: req.user?.userId }),
    );
  }

  /** Renomeia o grupo NO EQUIPAMENTO; o nome do departamento da instituição não muda. */
  @Put('departamento/:deqCodigo')
  @RequirePermission('equipamento', 'update')
  renomearDepartamento(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Param('deqCodigo', ParseIntPipe) deqCodigo: number,
    @Body() dto: DepartamentoNomeDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.renomearDepartamentoEquipamento(eqpCodigo, deqCodigo, dto.nome),
    );
  }

  /** Substitui as regras do departamento: uma `access_rule` por (horário, áreas). */
  @Put('departamento/:deqCodigo/regras')
  @RequirePermission('equipamento', 'update')
  salvarRegras(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Param('deqCodigo', ParseIntPipe) deqCodigo: number,
    @Body() dto: RegrasDepartamentoDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.salvarRegrasDepartamentoEquipamento(eqpCodigo, deqCodigo, dto.regras),
    );
  }

  @Post('departamento/:deqCodigo/revisar')
  @RequirePermission('equipamento', 'update')
  revisarDepartamento(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Param('deqCodigo', ParseIntPipe) deqCodigo: number,
    @Req() req: any,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.revisarDepartamentoEquipamento(eqpCodigo, deqCodigo, { usuario: req.user?.userId }),
    );
  }

  // ── adoção ─────────────────────────────────────────────────────────────

  /** Grupos do equipamento ainda sem adoção, com o que cada um já libera. */
  @Get('departamento/candidatos')
  @RequirePermission('equipamento', 'read')
  candidatos(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.candidatosDepartamentoEquipamento(eqpCodigo));
  }

  /** Adota um grupo que já existe na catraca. Não escreve nada nela. */
  @Post('departamento/adotar')
  @RequirePermission('equipamento', 'update')
  adotar(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Body() dto: DepartamentoAdotarDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.adotarDepartamentoEquipamento(eqpCodigo, dto));
  }

  /** Desfaz a adoção. O grupo e as regras continuam no equipamento. */
  @Delete('departamento/:deqCodigo')
  @RequirePermission('equipamento', 'update')
  desadotar(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('eqpCodigo', ParseIntPipe) eqpCodigo: number,
    @Param('deqCodigo', ParseIntPipe) deqCodigo: number,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.desadotarDepartamentoEquipamento(eqpCodigo, deqCodigo));
  }
}
