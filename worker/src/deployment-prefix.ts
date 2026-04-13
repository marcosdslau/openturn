type AllowedPrefix = 'DEV' | 'PRD';

const ALLOWED: AllowedPrefix[] = ['DEV', 'PRD'];

const NODE_ENV_MAP: Record<string, AllowedPrefix> = {
    DEV: 'DEV',
    development: 'DEV',
    test: 'DEV',
    production: 'PRD',
    PRD: 'PRD',
};

let cached: AllowedPrefix | null = null;

/**
 * Resolve o prefixo de deployment usado para isolar filas RabbitMQ e chaves/canais Redis
 * quando múltiplas instâncias (homolog + prod) compartilham o mesmo broker.
 *
 * Prioridade: OPENTURN_DEPLOYMENT_PREFIX > mapeamento de NODE_ENV.
 * Valores válidos: DEV, PRD.  Falha em boot se inválido.
 */
export function getDeploymentPrefix(): AllowedPrefix {
    if (cached) return cached;

    const explicit = process.env.OPENTURN_DEPLOYMENT_PREFIX?.trim().toUpperCase();
    if (explicit) {
        if (!ALLOWED.includes(explicit as AllowedPrefix)) {
            throw new Error(
                `OPENTURN_DEPLOYMENT_PREFIX="${explicit}" inválido. Valores permitidos: ${ALLOWED.join(', ')}`,
            );
        }
        cached = explicit as AllowedPrefix;
        return cached;
    }

    const nodeEnv = process.env.NODE_ENV?.trim() ?? '';
    const mapped = NODE_ENV_MAP[nodeEnv];
    if (!mapped) {
        throw new Error(
            `Não foi possível derivar prefixo de deployment: NODE_ENV="${nodeEnv}" não mapeado e OPENTURN_DEPLOYMENT_PREFIX não definido. ` +
            `Defina OPENTURN_DEPLOYMENT_PREFIX (${ALLOWED.join('|')}) ou use NODE_ENV em ${Object.keys(NODE_ENV_MAP).join(', ')}.`,
        );
    }
    cached = mapped;
    return cached;
}
