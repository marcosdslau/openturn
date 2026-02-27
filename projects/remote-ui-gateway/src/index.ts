import 'dotenv/config';
import express from 'express';
import { sessionValidator, closeSession, ValidatedSession } from './middleware/session-validator';
import { RelayBridge, applyRewrites } from './services/relay-bridge';

const PORT = parseInt(process.env.GATEWAY_PORT || '8002', 10);
const RELAY_URL = process.env.RELAY_WS_URL || 'ws://localhost:8001/ws/connectors';

const app = express();
const relay = new RelayBridge(RELAY_URL);

// ——— Close session endpoint ———
app.post(
    '/remote/s/:sessionId/__close',
    async (req, res) => {
        try {
            await closeSession(req.params.sessionId);
            res.json({ message: 'Sessão encerrada' });
        } catch {
            res.status(404).json({ error: 'Sessão não encontrada' });
        }
    },
);

// ——— Main proxy route ———
app.all(
    '/remote/s/:sessionId/*',
    sessionValidator as any,
    async (req: express.Request & { validatedSession?: ValidatedSession }, res) => {
        const session = req.validatedSession!;
        const sessionId = req.params.sessionId;
        const sessionPrefix = `/remote/s/${sessionId}/`;

        // Extract the downstream path (everything after /remote/s/:sessionId/)
        const downstreamPath = '/' + (req.params[0] || '');

        // Forward headers, excluding host
        const forwardHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (key === 'host' || key === 'connection') continue;
            if (typeof value === 'string') forwardHeaders[key] = value;
        }

        // Collect body for non-GET/HEAD
        let bodyStr: string | null = null;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(Buffer.from(chunk));
            }
            if (chunks.length > 0) {
                bodyStr = Buffer.concat(chunks).toString('utf-8');
            }
        }

        try {
            const proxyResult = await relay.sendHttpRequest(
                session,
                req.method,
                downstreamPath,
                forwardHeaders,
                bodyStr,
            );

            const rewritten = applyRewrites(
                proxyResult.statusCode,
                proxyResult.headers,
                proxyResult.body,
                sessionPrefix,
                sessionId,
            );

            // Send rewritten response
            res.status(rewritten.statusCode);
            for (const [key, value] of Object.entries(rewritten.headers)) {
                if (key.toLowerCase() === 'transfer-encoding') continue;
                res.setHeader(key, value);
            }
            res.send(rewritten.body);
        } catch (error: any) {
            console.error(`[Proxy] Error for session ${sessionId}:`, error.message);
            res.status(502).json({
                error: 'Falha ao conectar com o equipamento',
                detail: error.message,
            });
        }
    },
);

// ——— Health check ———
app.get('/health', (_req, res) => {
    res.json({ status: 'UP', service: 'remote-ui-gateway' });
});

// ——— Start ———
async function bootstrap() {
    try {
        await relay.connect();
    } catch (err: any) {
        console.warn(`[Bootstrap] Initial Relay connection failed: ${err.message}. Will retry.`);
    }

    app.listen(PORT, () => {
        console.log(`🚀 Remote UI Gateway running on http://localhost:${PORT}`);
        console.log(`   Relay: ${RELAY_URL}`);
        console.log(`   Database URL: ${process.env.DATABASE_URL ? 'Connected (loaded)' : 'NOT FOUND'}`);
    });
}

bootstrap();
