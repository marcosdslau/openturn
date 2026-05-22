import { Injectable } from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';

@Injectable()
export class ControlidInspectLoggerService {
  logWebhook(
    codigoInstituicao: number,
    tipo: 'dao' | 'catra_event',
    body: unknown,
  ): void {
    if (process.env.INSPECT !== 'true') return;

    const listRaw = process.env.LIST_INSTITUTIONS ?? '';
    const allowedList = listRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);

    if (!allowedList.includes(codigoInstituicao)) return;

    try {
      const logsDir = join(process.cwd(), 'logs');
      mkdirSync(logsDir, { recursive: true });

      const now = new Date();
      const dateStr = format(now, 'dd-MM-yyyy');
      const timeStr = format(now, 'HH:mm:ss');

      const fileName = `${dateStr}_${codigoInstituicao}.txt`;
      const filePath = join(logsDir, fileName);
      const line = `${dateStr}:${timeStr} ${tipo} ${JSON.stringify(body)}\n`;

      appendFileSync(filePath, line, 'utf-8');
    } catch {
      // silencioso para não interromper o fluxo do webhook
    }
  }
}
