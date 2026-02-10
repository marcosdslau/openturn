import { Module } from '@nestjs/common';
import { EquipamentoController } from './equipamento.controller';
import { EquipamentoService } from './equipamento.service';

@Module({
    controllers: [EquipamentoController],
    providers: [EquipamentoService],
})
export class EquipamentoModule { }
