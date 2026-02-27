export interface HttpRequestMessage {
    type: 'HTTP_REQUEST';
    requestId: string;
    tenantId: number;
    equipId: number;
    target: {
        baseUrl: string;
        method: string;
        path: string;
        headers: Record<string, string>;
        body: string | null;
    };
    timeoutMs: number;
}

export interface HttpResponseStartMessage {
    type: 'HTTP_RESPONSE_START';
    requestId: string;
    statusCode: number;
    headers: Record<string, string>;
}

export interface HttpResponseChunkMessage {
    type: 'HTTP_RESPONSE_CHUNK';
    requestId: string;
    data: string; // base64
    index: number;
}

export interface HttpResponseEndMessage {
    type: 'HTTP_RESPONSE_END';
    requestId: string;
}

export interface HttpResponseErrorMessage {
    type: 'HTTP_RESPONSE_ERROR';
    requestId: string;
    error: string;
}

export interface PingMessage {
    type: 'PING';
    ts: number;
}

export interface PongMessage {
    type: 'PONG';
    ts: number;
}

export type WsMessage =
    | HttpRequestMessage
    | HttpResponseStartMessage
    | HttpResponseChunkMessage
    | HttpResponseEndMessage
    | HttpResponseErrorMessage
    | PingMessage
    | PongMessage;

export type WsMessageType = WsMessage['type'];
