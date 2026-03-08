import { Injectable, Logger } from '@nestjs/common';
import {
    ILlmProviderAdapter,
    ChatMessageRequest,
    StreamChunkOutput,
    UsageRecord
} from './LlmProvider.interface';
import OpenAI from 'openai';
import { OPENAI_TOOLS, executeToolCall } from '../ai-project-rules';

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
        const conversationMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemContext },
            ...messages.map(m => ({
                role: m.role as 'system' | 'user' | 'assistant',
                content: m.content
            }))
        ];

        // Tool-call loop: the model may request tools before producing its final text answer
        const MAX_TOOL_ROUNDS = 3; // Safety cap to avoid infinite loops
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const stream = await this.openai.chat.completions.create({
                model: modelId,
                messages: conversationMessages,
                tools: OPENAI_TOOLS,
                stream: true,
                stream_options: { include_usage: true },
            });

            // Accumulators for the streamed response
            let pendingToolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
            let hasToolCalls = false;
            let finishReason: string | null = null;

            for await (const chunk of stream) {
                const choice = chunk.choices?.[0];

                if (choice?.delta?.tool_calls) {
                    hasToolCalls = true;
                    for (const tc of choice.delta.tool_calls) {
                        if (!pendingToolCalls.has(tc.index)) {
                            pendingToolCalls.set(tc.index, { id: tc.id || '', name: tc.function?.name || '', args: '' });
                        }
                        const entry = pendingToolCalls.get(tc.index)!;
                        if (tc.id) entry.id = tc.id;
                        if (tc.function?.name) entry.name = tc.function.name;
                        if (tc.function?.arguments) entry.args += tc.function.arguments;
                    }
                }

                // Stream text content to the user in real-time
                const chunkText = choice?.delta?.content || '';
                if (chunkText) {
                    onChunk({ id: chunk.id, chunkText, isDone: false });
                }

                if (choice?.finish_reason) {
                    finishReason = choice.finish_reason;
                }

                // Expose usage if provided in the trailing chunk
                if (chunk.usage) {
                    const usage: UsageRecord = {
                        inputTokens: chunk.usage.prompt_tokens,
                        outputTokens: chunk.usage.completion_tokens,
                    };

                    // If this is the final round (text answer, no more tools), signal done
                    if (!hasToolCalls || finishReason === 'stop') {
                        onChunk({ id: chunk.id, chunkText: '', isDone: true, usage });
                    }
                }
            }

            // If the model requested tool calls, execute them and loop
            if (hasToolCalls && finishReason === 'tool_calls') {
                // Build the assistant message with tool_calls
                const toolCallsArray = Array.from(pendingToolCalls.values());
                conversationMessages.push({
                    role: 'assistant',
                    content: null,
                    tool_calls: toolCallsArray.map(tc => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: { name: tc.name, arguments: tc.args }
                    }))
                });

                // Execute each tool and append the results
                for (const tc of toolCallsArray) {
                    let parsedArgs: Record<string, any> = {};
                    try { parsedArgs = JSON.parse(tc.args || '{}'); } catch { /* empty */ }

                    const result = executeToolCall(tc.name, parsedArgs);
                    this.logger.debug(`Tool [${tc.name}] called with ${tc.args} → ${result.length} chars`);

                    conversationMessages.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: result,
                    });
                }

                // Loop again — the model will now produce text using the tool results
                continue;
            }

            // No tool calls or finish_reason === 'stop' → we're done
            break;
        }
    }

    estimateTokens(text: string): number {
        // Rough estimation rule-of-thumb to avoid building a heavy tiktokenizer in the MVP
        return Math.ceil(text.length / 4);
    }
}
