import { mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

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
            const pad = (n: number) => String(n).padStart(2, '0');
            const fileName = `${this.instituicaoCodigo}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}.txt`;
            const filePath = join(this.logsDir, fileName);
            const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
            const line = `[${prefix}] ${time} - ${message}\n`;
            appendFileSync(filePath, line, 'utf-8');
        } catch {
            // silent
        }
    }
}
