import { Module } from '@nestjs/common';
import { QuestionDetectionService } from './question-detection.service';

@Module({
  providers: [QuestionDetectionService],
  exports: [QuestionDetectionService],
})
export class QuestionDetectionModule {}
