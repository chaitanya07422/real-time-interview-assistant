import { Module } from '@nestjs/common';
import { TranscriptionModule } from '../transcription/transcription.module';
import { AudioService } from './audio.service';

@Module({
  imports: [TranscriptionModule],
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}
