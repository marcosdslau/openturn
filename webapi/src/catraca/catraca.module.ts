import { Module } from '@nestjs/common';
import { CatracaController } from './catraca.controller';
import { CatracaService } from './catraca.service';

@Module({
  controllers: [CatracaController],
  providers: [CatracaService]
})
export class CatracaModule {}
