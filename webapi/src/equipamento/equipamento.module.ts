import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EquipamentoController } from './equipamento.controller';
import { EquipamentoService } from './equipamento.service';
import { ConnectorModule } from '../connector/connector.module';

@Module({
  imports: [AuthModule, ConnectorModule],
  controllers: [EquipamentoController],
  providers: [EquipamentoService],
})
export class EquipamentoModule {}
