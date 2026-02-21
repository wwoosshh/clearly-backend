import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ConnectionManager } from '../websocket/connection-manager';

@Global()
@Module({
  providers: [RedisService, ConnectionManager],
  exports: [RedisService, ConnectionManager],
})
export class RedisModule {}
