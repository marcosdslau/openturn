import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VisitanteController } from './visitante.controller';
import { VisitanteService } from './visitante.service';

@Module({
  imports: [AuthModule],
  controllers: [VisitanteController],
  providers: [VisitanteService],
})
export class VisitanteModule {}
