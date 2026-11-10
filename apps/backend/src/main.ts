import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { validateEnvironment } from './common/env.validation';
import { InterviewGateway } from './websocket/interview.gateway';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const env = validateEnvironment(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.enableCors({
    origin: [
      env.FRONTEND_ORIGIN,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
    credentials: true,
  });

  await app.init();

  const gateway = app.get(InterviewGateway);
  const httpServer = app.getHttpServer();
  gateway.attachToServer(httpServer);

  await app.listen(env.PORT, '0.0.0.0');
  logger.log(
    `Backend HTTP & WebSocket server running on http://localhost:${env.PORT} (WS: ws://localhost:${env.PORT})`,
  );
}

void bootstrap();
