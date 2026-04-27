import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatriculaController } from './matricula.controller';
import { MatriculaService } from './matricula.service';

@Module({
  imports: [AuthModule],
  controllers: [MatriculaController],
  providers: [MatriculaService],
})
export class MatriculaModule {}
