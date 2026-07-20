import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { WizardFotoService } from './wizard-foto.service';
import { VerificarEmailDto } from './dto/verificar-email.dto';
import { VerificarOtpDto } from './dto/verificar-otp.dto';
import { SalvarFotoDto } from './dto/salvar-foto.dto';
import {
  WizardEtapaRequired,
  WizardTokenGuard,
  WizardTokenPayload,
} from './wizard-token.guard';

interface RequestWithWizard extends Request {
  wizardPayload?: WizardTokenPayload;
}

@Controller('instituicao/:codigoInstituicao/wizard-foto')
export class WizardFotoController {
  constructor(private readonly wizardFotoService: WizardFotoService) {}

  @Post('verificar-email')
  async verificarEmail(
    @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
    @Body() dto: VerificarEmailDto,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    return this.wizardFotoService.verificarEmail(
      codigoInstituicao,
      dto.email,
      ip,
    );
  }

  @Post('enviar-otp')
  @WizardEtapaRequired('EMAIL_OK')
  @UseGuards(WizardTokenGuard)
  async enviarOtp(
    @Param('codigoInstituicao', ParseIntPipe) _codigoInstituicao: number,
    @Req() req: RequestWithWizard,
  ) {
    const { pesCodigo, instituicaoCodigo } = req.wizardPayload!;
    return this.wizardFotoService.enviarOtp(pesCodigo, instituicaoCodigo);
  }

  @Post('verificar-otp')
  @WizardEtapaRequired('EMAIL_OK')
  @UseGuards(WizardTokenGuard)
  async verificarOtp(
    @Param('codigoInstituicao', ParseIntPipe) _codigoInstituicao: number,
    @Body() dto: VerificarOtpDto,
    @Req() req: RequestWithWizard,
  ) {
    const { pesCodigo, instituicaoCodigo } = req.wizardPayload!;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    return this.wizardFotoService.verificarOtp(
      pesCodigo,
      instituicaoCodigo,
      dto.codigo,
      ip,
    );
  }

  @Post('salvar-foto')
  @WizardEtapaRequired('OTP_OK')
  @UseGuards(WizardTokenGuard)
  async salvarFoto(
    @Param('codigoInstituicao', ParseIntPipe) _codigoInstituicao: number,
    @Body() dto: SalvarFotoDto,
    @Req() req: RequestWithWizard,
  ) {
    const { pesCodigo, instituicaoCodigo } = req.wizardPayload!;
    return this.wizardFotoService.salvarFoto(
      instituicaoCodigo,
      pesCodigo,
      dto.fotoBase64,
    );
  }
}
