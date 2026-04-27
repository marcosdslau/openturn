import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { LlmOrchestratorService } from './services/llm-orchestrator.service';
import { AiConversationService } from './services/ai-conversation.service';
import { AiPermissionService } from './services/ai-permission.service';
import { AiUsageService } from './services/ai-usage.service';
import { AiPricingService } from './services/ai-pricing.service';
import { OpenAiAdapter } from './providers/openai.adapter';
// PrismaService might come from an external module, assuming standard setup
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [AiController],
  providers: [
    LlmOrchestratorService,
    AiConversationService,
    AiPermissionService,
    AiUsageService,
    AiPricingService,
    OpenAiAdapter,
    PrismaService,
  ],
  exports: [
    LlmOrchestratorService,
    AiConversationService,
    AiPermissionService,
    AiUsageService,
  ],
})
export class AiModule {}
