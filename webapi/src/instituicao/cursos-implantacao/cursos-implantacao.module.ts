import { Module } from '@nestjs/common';
import { CursosImplantacaoService } from './cursos-implantacao.service';
import { CursosImplantacaoController } from './cursos-implantacao.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CursosImplantacaoService],
  controllers: [CursosImplantacaoController],
})
export class CursosImplantacaoModule {}
