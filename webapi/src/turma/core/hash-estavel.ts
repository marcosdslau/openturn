import { createHash } from 'crypto';

/**
 * Hash estável (sha1 hex): objetos são serializados com chaves ordenadas, então a
 * ordem de montagem não altera o resultado. Mesmo algoritmo de `utils.hash` das
 * rotinas (`common/utils/foto-utils.ts`), replicado aqui porque o núcleo não pode
 * importar nada fora da própria pasta.
 */
export function hashEstavel(valor: unknown): string {
  const serializa = (v: unknown): string => {
    if (v === null || v === undefined) return 'null';
    if (typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return '[' + v.map(serializa).join(',') + ']';
    const obj = v as Record<string, unknown>;
    return (
      '{' +
      Object.keys(obj)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + serializa(obj[k]))
        .join(',') +
      '}'
    );
  };

  return createHash('sha1').update(serializa(valor)).digest('hex');
}
