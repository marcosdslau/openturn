export class HardwareLogger {
  constructor(private readonly context: string) {}

  log(message: string): void {
    console.log(`[${this.context}] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[${this.context}] ${message}`);
  }

  error(message: string, detail?: string): void {
    if (detail !== undefined) {
      console.error(`[${this.context}] ${message}`, detail);
    } else {
      console.error(`[${this.context}] ${message}`);
    }
  }
}
