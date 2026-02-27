import { Module } from '@nestjs/common';
import { EquipamentoController } from './equipamento.controller';
import { EquipamentoService } from './equipamento.service';
import { ConnectorModule } from '../connector/connector.module';

@Module({
    imports: [ConnectorModule],
    controllers: [EquipamentoController],
    providers: [EquipamentoService],
})
export class EquipamentoModule { }
