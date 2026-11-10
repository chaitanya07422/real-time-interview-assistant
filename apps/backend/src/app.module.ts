import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'path';
import { AnswerGenerationModule } from './answer-generation/answer-generation.module';
import { AudioModule } from './audio/audio.module';
import { validateEnvironment } from './common/env.validation';
import { MetricsModule } from './metrics/metrics.module';
import { QuestionDetectionModule } from './question-detection/question-detection.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { WebsocketModule } from './websocket/websocket.module';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'real-time-interview-assistant-backend',
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '../../.env'),
      ],
      validate: validateEnvironment,
    }),
    AudioModule,
    TranscriptionModule,
    QuestionDetectionModule,
    AnswerGenerationModule,
    MetricsModule,
    WebsocketModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
