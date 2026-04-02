/** Prefixo `[Worker] dd/mm/aaaa hh:mm:ss` para stdout/stderr. */
export function formatWorkerTimestamp(d: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function workerLogLine(body: string): string {
    return `${formatWorkerTimestamp()} [Worker] ${body}`;
}
