import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { BrevoMailService } from './brevo-mail.service';
import { PermissionsGuard } from './permissions.guard';

@Module({
    imports: [
        PassportModule,
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'openturn_super_secret_key',
            signOptions: { expiresIn: '24h' },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, BrevoMailService, PermissionsGuard],
    exports: [AuthService, PermissionsGuard],
})
export class AuthModule { }
