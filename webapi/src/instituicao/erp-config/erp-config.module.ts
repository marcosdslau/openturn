import { Module } from '@nestjs/common';
import { ERPConfigService } from './erp-config.service';
import { ERPConfigController } from './erp-config.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [ERPConfigService],
    controllers: [ERPConfigController],
    exports: [ERPConfigService],
})
export class ERPConfigModule { }
