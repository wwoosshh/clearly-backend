import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../cache/redis.service';

const MAX_CONNECTIONS_PER_USER = 5;
const SOCKET_TTL = 3600; // 1시간

@Injectable()
export class ConnectionManager {
  private readonly logger = new Logger(ConnectionManager.name);

  // 인메모리 폴백 (Redis 미연결 시)
  private userSocketMap = new Map<string, string[]>();
  private socketUserMap = new Map<string, string>();

  constructor(private readonly redis: RedisService) {}

  private userKey(context: string, userId: string): string {
    return `ws:${context}:user:${userId}`;
  }

  private socketKey(context: string, socketId: string): string {
    return `ws:${context}:socket:${socketId}`;
  }

  async addConnection(
    context: string,
    userId: string,
    socketId: string,
    server?: Server,
  ): Promise<void> {
    // Redis에 저장
    const uKey = this.userKey(context, userId);
    const sKey = this.socketKey(context, socketId);

    await this.redis.sadd(uKey, socketId);
    await this.redis.expire(uKey, SOCKET_TTL);
    await this.redis.set(sKey, userId, SOCKET_TTL);

    // 인메모리 폴백도 업데이트
    this.socketUserMap.set(socketId, userId);
    const sockets = this.userSocketMap.get(userId) || [];
    sockets.push(socketId);

    // 유저당 최대 연결 수 초과 시 가장 오래된 연결 제거
    while (sockets.length > MAX_CONNECTIONS_PER_USER) {
      const oldSocketId = sockets.shift()!;
      this.socketUserMap.delete(oldSocketId);
      await this.redis.srem(uKey, oldSocketId);
      await this.redis.del(this.socketKey(context, oldSocketId));

      if (server) {
        const activeSockets = this.getActiveSockets(server);
        const oldSocket = activeSockets?.get(oldSocketId);
        if (oldSocket) {
          this.logger.warn(
            `연결 수 초과로 기존 소켓 해제: userId=${userId}, socketId=${oldSocketId}`,
          );
          oldSocket.disconnect(true);
        }
      }
    }

    this.userSocketMap.set(userId, sockets);
  }

  async removeConnection(
    context: string,
    socketId: string,
  ): Promise<string | undefined> {
    // 인메모리에서 userId 조회
    const userId = this.socketUserMap.get(socketId);
    if (!userId) return undefined;

    this.socketUserMap.delete(socketId);

    const sockets = this.userSocketMap.get(userId);
    if (sockets) {
      const filtered = sockets.filter((id) => id !== socketId);
      if (filtered.length > 0) {
        this.userSocketMap.set(userId, filtered);
      } else {
        this.userSocketMap.delete(userId);
      }
    }

    // Redis에서도 제거
    await this.redis.srem(this.userKey(context, userId), socketId);
    await this.redis.del(this.socketKey(context, socketId));

    return userId;
  }

  async getSocketIds(context: string, userId: string): Promise<string[]> {
    // Redis 우선, 폴백으로 인메모리
    const redisIds = await this.redis.smembers(
      this.userKey(context, userId),
    );
    if (redisIds.length > 0) return redisIds;
    return this.userSocketMap.get(userId) || [];
  }

  getUserId(socketId: string): string | undefined {
    return this.socketUserMap.get(socketId);
  }

  getTotalConnections(): number {
    return this.socketUserMap.size;
  }

  cleanupStaleConnections(context: string, server: Server): void {
    const activeSockets = this.getActiveSockets(server);
    if (!activeSockets) return;

    let cleaned = 0;
    for (const [socketId, userId] of this.socketUserMap.entries()) {
      if (!activeSockets.has(socketId)) {
        this.socketUserMap.delete(socketId);
        const sockets = this.userSocketMap.get(userId);
        if (sockets) {
          const filtered = sockets.filter((id) => id !== socketId);
          if (filtered.length > 0) {
            this.userSocketMap.set(userId, filtered);
          } else {
            this.userSocketMap.delete(userId);
          }
        }
        // Redis 정리 (비동기, 실패 무시)
        this.redis.srem(this.userKey(context, userId), socketId).catch(() => {});
        this.redis.del(this.socketKey(context, socketId)).catch(() => {});
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.log(`고아 매핑 정리: ${cleaned}건`);
    }
  }

  /** namespace 서버와 root 서버 모두 대응 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getActiveSockets(server: Server): Map<string, any> | null {
    if (!server?.sockets) return null;
    return (server.sockets as any).sockets ?? server.sockets;
  }
}
