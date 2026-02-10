import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // 프록시 환경 (Railway 등) 에서 클라이언트 IP 정확히 식별
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // 보안 헤더 (Helmet)
  app.use(helmet());

  // 응답 압축 (gzip)
  app.use(
    compression({
      threshold: 1024,
      level: 6,
      filter: (req, res) => {
        if (req.headers['upgrade'] === 'websocket') return false;
        return compression.filter(req, res);
      },
    }),
  );

  // CORS 설정 (환경별 분리)
  const frontendUrl =
    configService.get('FRONTEND_URL') || 'http://localhost:3000';
  const allowedOrigins = frontendUrl
    .split(',')
    .map((url: string) => url.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BarunOrder API')
    .setDescription('이사청소 매칭 플랫폼 바른오더 API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Graceful Shutdown
  app.enableShutdownHooks();

  const port = configService.get('PORT') || 4000;
  await app.listen(port);

  logger.log(`Server running on port ${port}`);
  logger.log(`API docs: http://localhost:${port}/api/docs`);
}
bootstrap();
