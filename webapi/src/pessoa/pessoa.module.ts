import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HardwareModule } from '../hardware/hardware.module';
import { PessoaController } from './pessoa.controller';
import { PessoaService } from './pessoa.service';
import { GenneraPessoaService } from './gennera/gennera-pessoa.service';

@Module({
  imports: [AuthModule, HardwareModule],
  controllers: [PessoaController],
  providers: [PessoaService, GenneraPessoaService],
})
export class PessoaModule {}
