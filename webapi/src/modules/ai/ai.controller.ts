import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import { LlmOrchestratorService } from './services/llm-orchestrator.service';
import { AiConversationService } from './services/ai-conversation.service';
import { AiPricingService } from './services/ai-pricing.service';
import { AiUsageService } from './services/ai-usage.service';
import { ChatMessageRequest } from './providers/LlmProvider.interface';
import type { Request, Response } from 'express';

@Controller('instituicoes/:codIns/ia')
export class AiController {
  constructor(
    private orchestrator: LlmOrchestratorService,
    private conversationService: AiConversationService,
    private pricingService: AiPricingService,
    private usageService: AiUsageService,
  ) {}

  @Get('models')
  async getModels(@Param('codIns', ParseIntPipe) instituicaoCodigo: number) {
    return await this.pricingService.getAvailableModels();
  }

  @Get('conversations/routine/:rotinaId')
  async getConversations(
    @Param('codIns', ParseIntPipe) instituicaoCodigo: number,
    @Param('rotinaId', ParseIntPipe) rotinaCodigo: number,
    @Req() req: Request,
  ) {
    const userCodigo = (req as any).user?.USRCodigo || 1;
    return await this.conversationService.getUserRoutineConversations(
      instituicaoCodigo,
      userCodigo,
      rotinaCodigo,
    );
  }

  @Post('conversations/routine/:rotinaId/new')
  async createNewConversation(
    @Param('codIns', ParseIntPipe) instituicaoCodigo: number,
    @Param('rotinaId', ParseIntPipe) rotinaCodigo: number,
    @Body('modelCodigo') modelCodigo: number,
    @Req() req: Request,
  ) {
    const userCodigo = (req as any).user?.USRCodigo || 1;
    // Default to GPT-4o-mini (3) if not passed
    return await this.conversationService.createRoutineConversation(
      instituicaoCodigo,
      userCodigo,
      modelCodigo || 3,
      rotinaCodigo,
    );
  }

  @Get('conversations/:chatId/messages')
  async getRoutineMessages(
    @Param('codIns', ParseIntPipe) instituicaoCodigo: number,
    @Param('chatId', ParseIntPipe) conversaCodigo: number,
    @Req() req: Request,
  ) {
    // Verify conversation belongs to tenant
    const conversa = await this.conversationService.getConversationById(
      instituicaoCodigo,
      conversaCodigo,
    );
    return await this.conversationService.getMessages(
      instituicaoCodigo,
      conversa.AICCodigo,
    );
  }

  @Get('billing/usage')
  async getUsage(
    @Param('codIns', ParseIntPipe) instituicaoCodigo: number,
    @Req() req: Request,
  ) {
    const userCodigo = (req as any).user?.USRCodigo || 1;
    const used = await this.usageService.getDailyTokensUsed(
      instituicaoCodigo,
      userCodigo,
    );
    return { tokensUsedToday: used };
  }

  @Post('conversations/:chatId/stream')
  async streamConversation(
    @Param('codIns', ParseIntPipe) instituicaoCodigo: number,
    @Param('chatId', ParseIntPipe) conversaCodigo: number,
    @Req() req: Request,
    @Res() res: Response,
    @Body('modelCodigo') modelCodigo: number,
    @Body('messages') messages: ChatMessageRequest[],
  ) {
    const userCodigo = (req as any).user?.USRCodigo || 1;

    // 1. Get the existing thread
    const conversa = await this.conversationService.getConversationById(
      instituicaoCodigo,
      conversaCodigo,
    );

    // 2. Extract and save the last user message directly to History DB before inferencing
    // We assume the frontend passes the last n messages but the newest is the user's latest prompt
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === 'user') {
      await this.conversationService.saveMessage(
        instituicaoCodigo,
        conversa.AICCodigo,
        'user',
        lastUserMsg.content,
      );

      // Auto-title: if the conversation still has the default title, update with first message
      if (conversa.AICTitulo?.startsWith('Chat Rotina #')) {
        const title = lastUserMsg.content
          .replace(/\n/g, ' ')
          .trim()
          .substring(0, 50);
        await this.conversationService.updateTitle(
          instituicaoCodigo,
          conversa.AICCodigo,
          title || 'Nova conversa',
        );
      }
    }

    // Configuração de Headers para SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Mantém a conexão aberta e dá flush no buffer imediato (caso haja compression middleware)
    res.flushHeaders();

    let streamEnded = false;

    try {
      await this.orchestrator.predictStream(
        instituicaoCodigo,
        userCodigo,
        modelCodigo,
        messages,
        (chunk) => {
          if (streamEnded) return; // Guard: don't write after res.end()

          const payload = JSON.stringify({
            chunkText: chunk.chunkText,
            isDone: chunk.isDone,
            usage: chunk.usage,
          });
          res.write(`data: ${payload}\n\n`);
        },
        async (assistantFullReply, usage) => {
          if (assistantFullReply) {
            await this.conversationService.saveMessage(
              instituicaoCodigo,
              conversa.AICCodigo,
              'assistant',
              assistantFullReply,
              {
                inputTokens: usage?.inputTokens || 0,
                outputTokens: usage?.outputTokens || 0,
                costUsd: usage?.costUsd || 0,
              },
            );
          }
        },
      );

      // Ensure the response is always closed after the stream pipeline completes
      if (!streamEnded) {
        streamEnded = true;
        res.end();
      }
    } catch (err: any) {
      if (!streamEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`,
        );
        res.end();
        streamEnded = true;
      }
    }
  }
}
