import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

const MAX_CONNECTIONS_PER_USER = 5;

export class ConnectionManager {
  private readonly logger: Logger;
  private userSocketMap = new Map<string, string[]>();
  private socketUserMap = new Map<string, string>();

  constructor(context: string) {
    this.logger = new Logger(`ConnectionManager:${context}`);
  }

  addConnection(userId: string, socketId: string, server?: Server): void {
    this.socketUserMap.set(socketId, userId);

    const sockets = this.userSocketMap.get(userId) || [];
    sockets.push(socketId);

    // 유저당 최대 연결 수 초과 시 가장 오래된 연결 제거
    while (sockets.length > MAX_CONNECTIONS_PER_USER) {
      const oldSocketId = sockets.shift()!;
      this.socketUserMap.delete(oldSocketId);
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

  removeConnection(socketId: string): string | undefined {
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

    return userId;
  }

  getSocketIds(userId: string): string[] {
    return this.userSocketMap.get(userId) || [];
  }

  getUserId(socketId: string): string | undefined {
    return this.socketUserMap.get(socketId);
  }

  getTotalConnections(): number {
    return this.socketUserMap.size;
  }

  cleanupStaleConnections(server: Server): void {
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
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.log(`고아 매핑 정리: ${cleaned}건`);
    }
  }

  /** namespace 서버와 root 서버 모두 대응 */
  private getActiveSockets(server: Server): Map<string, any> | null {
    if (!server?.sockets) return null;
    // root Server: server.sockets.sockets (Map)
    // Namespace: server.sockets 자체가 Map
    return (server.sockets as any).sockets ?? server.sockets;
  }
}
