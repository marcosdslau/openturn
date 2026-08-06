import { Module } from '@nestjs/common';
import { InstituicaoController } from './instituicao.controller';
import { InstituicaoService } from './instituicao.service';
import { ERPConfigModule } from './erp-config/erp-config.module';
import { CursosImplantacaoModule } from './cursos-implantacao/cursos-implantacao.module';
import { RotinaModule } from '../rotina/rotina.module';

@Module({
  imports: [ERPConfigModule, CursosImplantacaoModule, RotinaModule],
  controllers: [InstituicaoController],
  providers: [InstituicaoService],
})
export class InstituicaoModule {}
