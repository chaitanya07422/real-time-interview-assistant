import { Module } from '@nestjs/common';
import { AnswerGenerationService } from './answer-generation.service';

@Module({
  providers: [AnswerGenerationService],
  exports: [AnswerGenerationService],
})
export class AnswerGenerationModule {}
