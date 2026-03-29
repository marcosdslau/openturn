import { existsSync } from 'fs';
import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

// Em build, main fica em dist/src/main.js → .env na raiz do pacote é ../../.env
// Em execução direta de src/, basta ../.env
const envPath =
  [join(__dirname, '..', '..', '.env'), join(__dirname, '..', '.env')].find(
    (p) => existsSync(p),
  ) ?? join(process.cwd(), '.env');
loadEnv({ path: envPath });

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Increase payload limits for photo uploads
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.setGlobalPrefix('api');
  app.enableCors(); // Enable CORS for all origins (for development)
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.listen(process.env.PORT ?? 8000);
}
bootstrap();

