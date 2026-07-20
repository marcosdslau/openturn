import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('instituicao/:codigoInstituicao/wizard-foto')
export class WizardQrcodeController {
  private buildWizardUrl(codigoInstituicao: number): string {
    const base = (process.env.PUBLIC_WEBAPP_URL ?? '').replace(/\/$/, '');
    return `${base}/wizard-foto/${codigoInstituicao}`;
  }

  @Get('qrcode.png')
  @UseGuards(JwtAuthGuard)
  async downloadPng(
    @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
    @Res() res: Response,
  ) {
    const url = this.buildWizardUrl(codigoInstituicao);
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qrcode-wizard-foto-${codigoInstituicao}.png"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get('qrcode.pdf')
  @UseGuards(JwtAuthGuard)
  async downloadPdf(
    @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
    @Res() res: Response,
  ) {
    const url = this.buildWizardUrl(codigoInstituicao);
    const pngBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', resolve);
      doc.on('error', reject);

      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('Cadastro de Foto Facial — Autoatendimento', { align: 'center' });

      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          'Aponte a câmera do seu celular para o QR Code abaixo e siga as instruções na tela para cadastrar ou atualizar sua foto.',
          { align: 'center' },
        );

      doc.moveDown(1);

      const imgSize = 280;
      const x = (doc.page.width - imgSize) / 2;
      doc.image(pngBuffer, x, doc.y, { width: imgSize, height: imgSize });

      doc.moveDown(1);
      doc.y += imgSize;

      doc
        .fontSize(9)
        .fillColor('#666666')
        .text(url, { align: 'center', link: url });

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="qrcode-wizard-foto-${codigoInstituicao}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
}
