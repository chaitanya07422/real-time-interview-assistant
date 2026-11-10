import { Module } from '@nestjs/common';
import { AnswerGenerationModule } from '../answer-generation/answer-generation.module';
import { AudioModule } from '../audio/audio.module';
import { MetricsModule } from '../metrics/metrics.module';
import { QuestionDetectionModule } from '../question-detection/question-detection.module';
import { InterviewGateway } from './interview.gateway';
import { SessionManagerService } from './session.manager';

@Module({
  imports: [
    AudioModule,
    QuestionDetectionModule,
    AnswerGenerationModule,
    MetricsModule,
  ],
  providers: [SessionManagerService, InterviewGateway],
  exports: [SessionManagerService, InterviewGateway],
})
export class WebsocketModule {}
