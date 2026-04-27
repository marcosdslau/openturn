import { mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';

export class FileLogger {
  private readonly logsDir: string;
  private readonly instituicaoCodigo: number;

  constructor(instituicaoCodigo: number, logsDir: string) {
    this.instituicaoCodigo = instituicaoCodigo;
    this.logsDir = logsDir;
  }

  log(message: string): void {
    this.write('LOG', message);
  }

  info(message: string): void {
    this.write('INFO', message);
  }

  error(message: string): void {
    this.write('ERR', message);
  }

  private write(prefix: string, message: string): void {
    try {
      mkdirSync(this.logsDir, { recursive: true });

      const now = new Date();
      const fileName = `${this.instituicaoCodigo}_${format(now, 'dd-MM-yyyy')}.txt`;
      const filePath = join(this.logsDir, fileName);
      const time = format(now, 'HH:mm:ss');
      const line = `[${prefix}] ${time} - ${message}\n`;

      appendFileSync(filePath, line, 'utf-8');
    } catch (err) {
      // Fallback silencioso para não quebrar a rotina
    }
  }
}
