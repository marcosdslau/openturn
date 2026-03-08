import { Injectable, Logger } from '@nestjs/common';
import {
    ILlmProviderAdapter,
    ChatMessageRequest,
    StreamChunkOutput,
    UsageRecord
} from './LlmProvider.interface';
import OpenAI from 'openai';

@Injectable()
export class OpenAiAdapter implements ILlmProviderAdapter {
    providerCode = 'OPENAI';
    private openai: OpenAI;
    private readonly logger = new Logger(OpenAiAdapter.name);

    constructor() {
        // Requires OPENAI_API_KEY in the environment (.env)
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async predictStream(
        modelId: string,
        systemContext: string,
        messages: ChatMessageRequest[],
        onChunk: (chunk: StreamChunkOutput) => void
    ): Promise<void> {
        const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemContext },
            ...messages.map(m => ({
                role: m.role as 'system' | 'user' | 'assistant',
                content: m.content
            }))
        ];

        try {
            const stream = await this.openai.chat.completions.create({
                model: modelId,
                messages: formattedMessages,
                stream: true,
                stream_options: { include_usage: true }, // Asks the API to append the usage stats at the end
            });

            for await (const chunk of stream) {
                // Delta may be undefined if it is the usage chunk or end of choices
                const chunkText = chunk.choices?.[0]?.delta?.content || '';
                const isDone = chunk.choices?.[0]?.finish_reason != null;

                // Expose usage if provided in the trailing chunk
                let usage: UsageRecord | undefined = undefined;
                if (chunk.usage) {
                    usage = {
                        inputTokens: chunk.usage.prompt_tokens,
                        outputTokens: chunk.usage.completion_tokens,
                    };
                }

                // Trigger the callback for the SSE stream to parse
                onChunk({
                    id: chunk.id,
                    chunkText,
                    isDone,
                    usage,
                });
            }
        } catch (error) {
            this.logger.error('OpenAI stream prediction failed', error);
            throw error;
        }
    }

    estimateTokens(text: string): number {
        // Rough estimation rule-of-thumb to avoid building a heavy tiktokenizer in the MVP
        return Math.ceil(text.length / 4);
    }
}
