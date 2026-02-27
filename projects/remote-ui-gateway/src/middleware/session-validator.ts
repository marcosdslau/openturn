import { PrismaClient } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

export interface ValidatedSession {
    sessionId: string;
    equipamento: {
        EQPCodigo: number;
        EQPEnderecoIp: string | null;
        EQPConfig: any;
        EQPUsaAddon: boolean;
        INSInstituicaoCodigo: number;
    };
    connector: {
        CONCodigo: number;
    };
}

/**
 * Express middleware that validates the session from the URL parameter.
 * Attaches the validated session to `req.validatedSession`.
 */
export async function sessionValidator(
    req: Request & { validatedSession?: ValidatedSession },
    res: Response,
    next: NextFunction,
) {
    const sessionId = req.params.sessionId;

    if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    try {
        const sessao = await prisma.rMTSessaoRemota.findUnique({
            where: { RMTSessionId: sessionId },
            include: {
                equipamento: true,
                connector: true,
            },
        });

        if (!sessao) {
            return res.status(404).json({ error: 'Sessão não encontrada' });
        }

        if (sessao.RMTStatus !== 'ATIVA') {
            return res.status(403).json({ error: 'Sessão encerrada ou expirada' });
        }

        if (new Date() > sessao.RMTExpiraEm) {
            await prisma.rMTSessaoRemota.update({
                where: { RMTCodigo: sessao.RMTCodigo },
                data: { RMTStatus: 'EXPIRADA' },
            });
            return res.status(403).json({ error: 'Sessão expirada' });
        }

        req.validatedSession = {
            sessionId,
            equipamento: sessao.equipamento,
            connector: sessao.connector,
        };

        next();
    } catch (error: any) {
        console.error('Session validation error:', error.message);
        return res.status(500).json({ error: 'Erro interno na validação da sessão' });
    }
}

/**
 * Close a session by setting its status to ENCERRADA.
 */
export async function closeSession(sessionId: string) {
    return prisma.rMTSessaoRemota.update({
        where: { RMTSessionId: sessionId },
        data: { RMTStatus: 'ENCERRADA' },
    });
}
