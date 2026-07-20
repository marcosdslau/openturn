import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { WizardFotoController } from './wizard-foto.controller';
import { WizardFotoService } from './wizard-foto.service';
import { WizardTokenGuard } from './wizard-token.guard';
import { WizardQrcodeController } from './qrcode/wizard-qrcode.controller';
import { PrismaModule } from '../common/prisma/prisma.module';
import { HardwareModule } from '../hardware/hardware.module';
import { PessoaModule } from '../pessoa/pessoa.module';
import { AuthModule } from '../auth/auth.module';
import { BrevoMailService } from '../auth/brevo-mail.service';

@Module({
  imports: [
    PrismaModule,
    HardwareModule,
    PessoaModule,
    AuthModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'openturn_super_secret_key',
      signOptions: { expiresIn: '10m' },
    }),
  ],
  controllers: [WizardFotoController, WizardQrcodeController],
  providers: [WizardFotoService, WizardTokenGuard, BrevoMailService],
})
export class WizardFotoModule {}
