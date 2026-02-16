import { Module } from '@nestjs/common';
import { UsuarioController } from './usuario.controller';
import { InstituicaoUsuarioController } from './instituicao-usuario.controller';
import { UsuarioService } from './usuario.service';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [AuthModule],
    controllers: [UsuarioController, InstituicaoUsuarioController],
    providers: [UsuarioService],
    exports: [UsuarioService],
})
export class UsuarioModule { }
