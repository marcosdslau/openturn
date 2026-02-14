import { Module } from '@nestjs/common';
import { AdminUsuarioController } from './admin-usuario.controller';
import { AdminUsuarioService } from './admin-usuario.service';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [AuthModule],
    controllers: [AdminUsuarioController],
    providers: [AdminUsuarioService],
})
export class AdminUsuarioModule { }
