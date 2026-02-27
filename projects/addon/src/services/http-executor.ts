import { request } from 'undici';
import { logger } from '../utils/logger';
import {
    HttpRequestMessage,
    HttpResponseStartMessage,
    HttpResponseChunkMessage,
    HttpResponseEndMessage,
    HttpResponseErrorMessage
} from '../types/protocol';
import { WssClient } from './ws-client';

export class HttpExecutor {
    constructor(private wsClient: WssClient) { }

    async execute(msg: HttpRequestMessage) {
        const { requestId, target, timeoutMs } = msg;

        logger.info(`[${requestId}] Proxying ${target.method} ${target.path} to ${target.baseUrl}`);

        try {
            const url = new URL(target.path, target.baseUrl).toString();

            const { statusCode, headers, body } = await request(url, {
                method: target.method as any,
                headers: target.headers,
                body: target.body,
                headersTimeout: timeoutMs,
                bodyTimeout: timeoutMs,
            });

            // Send Response Start
            this.wsClient.send({
                type: 'HTTP_RESPONSE_START',
                requestId,
                statusCode,
                headers: headers as Record<string, string>,
            } as HttpResponseStartMessage);

            // Stream Body in chunks
            let index = 0;
            for await (const chunk of body) {
                this.wsClient.send({
                    type: 'HTTP_RESPONSE_CHUNK',
                    requestId,
                    data: Buffer.from(chunk).toString('base64'),
                    index: index++,
                } as HttpResponseChunkMessage);
            }

            // Send Response End
            this.wsClient.send({
                type: 'HTTP_RESPONSE_END',
                requestId,
            } as HttpResponseEndMessage);

            logger.info(`[${requestId}] Request completed with status ${statusCode}`);
        } catch (error: any) {
            logger.error(`[${requestId}] Request failed`, error);

            this.wsClient.send({
                type: 'HTTP_RESPONSE_ERROR',
                requestId,
                error: error.message || 'Unknown error',
            } as HttpResponseErrorMessage);
        }
    }
}
