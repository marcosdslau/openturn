import type Redis from 'ioredis';
import { getDeploymentPrefix } from '../deployment-prefix';

/**
 * Chave prefixada para rate limit do wizard de foto.
 * Separa ambientes (DEV/PRD) pelo mesmo prefixo usado no restante do projeto.
 */
export function wizardRateLimitKey(scope: string): string {
  return `${getDeploymentPrefix()}:wizard-foto:rl:${scope}`;
}

/**
 * Verifica e incrementa um contador de rate limit usando INCR + EXPIRE atômico.
 *
 * Retorna `{ allowed: true }` se dentro do limite ou
 * `{ allowed: false, retryAfter }` com segundos restantes quando bloqueado.
 */
export async function checkRateLimit(
  redis: Redis,
  key: string,
  maxRequests: number,
  windowSecs: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.ttl(key);
  const results = await pipeline.exec();

  const count = (results?.[0]?.[1] ?? 0) as number;
  const ttl = (results?.[1]?.[1] ?? -1) as number;

  if (count === 1 || ttl < 0) {
    await redis.expire(key, windowSecs);
  }

  if (count > maxRequests) {
    const retryAfter = ttl > 0 ? ttl : windowSecs;
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}
