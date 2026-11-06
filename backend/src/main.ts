import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // nginx is the one proxy in front; trust its X-Forwarded-For so req.ip is the
  // real client (the login throttle is keyed on it).
  app.set('trust proxy', 1);
  app.use(cookieParser());
  // nginx forwards the /api/ prefix through unchanged (proxy_pass has no
  // trailing path), so routes are defined without it and this adds it back.
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3100);
}
bootstrap();
