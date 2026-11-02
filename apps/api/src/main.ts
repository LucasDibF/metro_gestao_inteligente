import { requestLog, SafeExceptionFilter } from './operations/http-observability';
import { developmentBypassEnabled } from './auth/development-access';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(requestLog);
  app.useGlobalFilters(new SafeExceptionFilter());
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.PORT ?? 3000),
    developmentBypassEnabled() ? '127.0.0.1' : '0.0.0.0',
  );
}
bootstrap().catch(() => {
  console.error('API startup failed');
  process.exitCode = 1;
});
