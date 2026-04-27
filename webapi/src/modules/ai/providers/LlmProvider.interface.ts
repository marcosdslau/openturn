export interface ChatMessageRequest {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  costUsd?: number;
}

export interface StreamChunkOutput {
  id: string;
  chunkText: string;
  isDone: boolean;
  usage?: UsageRecord;
}

export interface ILlmProviderAdapter {
  /**
   * Identifier of the provider, ex: 'OPENAI', 'ANTHROPIC'
   */
  providerCode: string;

  /**
   * Executes a prompt and streams the response chunk by chunk.
   */
  predictStream(
    modelId: string,
    systemContext: string,
    messages: ChatMessageRequest[],
    onChunk: (chunk: StreamChunkOutput) => void,
  ): Promise<void>;

  /**
   * Fast local estimation if the usage headers are not provided, or for validating before sending.
   */
  estimateTokens?(text: string): number;
}
