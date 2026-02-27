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

// ——— Referer Middleware for Orphaned Assets ———
// Captures requests like /css/style.css that missed HTML rewriting
app.use((req, res, next) => {
    // If the request already has the session prefix, skip
    if (req.path.startsWith('/remote/s/')) {
        return next();
    }

    const referer = req.headers.referer;
    if (!referer) {
        return next();
    }

    try {
        const url = new URL(referer);
        // Look for /remote/s/{uuid} in the referer path
        const match = url.pathname.match(/^\/remote\/s\/([a-f0-9-]+)\/?/i);

        if (match && match[1]) {
            const sessionId = match[1];
            // Rewrite the internal URL to include the session prefix
            // e.g. /css/style.css -> /remote/s/uuid/css/style.css
            const originalPath = req.url; // includes query string
            const newUrl = `/remote/s/${sessionId}${originalPath.startsWith('/') ? originalPath : '/' + originalPath}`;

            console.log(`[Referer-Proxy] Redirecting orphaned request ${req.url} -> ${newUrl}`);
            return res.redirect(307, newUrl);
        }
    } catch {
        // Ignore invalid Referer URLs
    }

    next();
});

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

        // Strip session prefix from referer/origin so the turnstile doesn't see our proxy paths
        if (forwardHeaders['referer']) {
            forwardHeaders['referer'] = forwardHeaders['referer'].replace(sessionPrefix, '/');
        }
        if (forwardHeaders['origin']) {
            // Origin is just the scheme+host, no path — leave it
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

        console.log(`[Proxy] ${req.method} ${downstreamPath} (session: ${sessionId})`);
        console.log(`[Proxy] Browser cookies: ${req.headers.cookie || '(none)'}`);

        try {
            const proxyResult = await relay.sendHttpRequest(
                session,
                req.method,
                downstreamPath,
                forwardHeaders,
                bodyStr,
            );

            console.log(`[Proxy] Upstream response: status=${proxyResult.statusCode}`);
            console.log(`[Proxy] Upstream headers:`, JSON.stringify(proxyResult.headers, null, 2));
            console.log(`[Proxy] Upstream body (first 500 chars):`, proxyResult.body.toString('utf-8').substring(0, 500));

            const rewritten = applyRewrites(
                proxyResult.statusCode,
                proxyResult.headers,
                proxyResult.body,
                sessionPrefix,
                sessionId,
                downstreamPath,
            );

            // Send rewritten response
            console.log(`[Proxy] Response: ${rewritten.statusCode} | Content-Type: ${rewritten.headers['content-type'] || 'N/A'} | Body size: ${rewritten.body.length}`);
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
