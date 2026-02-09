import type { Socket } from 'socket.io';
import { BrowserSession } from './BrowserSession';
import { BaseClient, ViewerClient, ApiClient, ClientType } from './clients';
import { logger } from '../utils';

/**
 * 会话管理器
 * 负责管理所有浏览器会话的生命周期和客户端
 */
class SessionManager {
  // 以 token 为 key 存储浏览器会话
  private sessionsByToken = new Map<string, BrowserSession>();
  // socket.id -> Client 的映射
  private clientsBySocketId = new Map<string, BaseClient>();
  // socket.id -> token 的映射
  private socketTokenMap = new Map<string, string>();

  /**
   * 根据 socket 获取客户端
   */
  getClientBySocket(socket: Socket): BaseClient | undefined {
    return this.clientsBySocketId.get(socket.id);
  }

  /**
   * 获取 socket 对应的会话
   */
  getSessionBySocket(socket: Socket): BrowserSession | undefined {
    const token = this.socketTokenMap.get(socket.id);
    return token ? this.sessionsByToken.get(token) : undefined;
  }

  /**
   * 获取 token 对应的会话
   */
  getSessionByToken(token: string): BrowserSession | undefined {
    return this.sessionsByToken.get(token);
  }

  /**
   * 创建客户端实例
   */
  private createClient(socket: Socket, clientType: ClientType): BaseClient {
    return clientType === ClientType.VIEWER ? new ViewerClient(socket) : new ApiClient(socket);
  }

  /**
   * 连接到浏览器
   */
  async connectBrowser(
    socket: Socket,
    token: string,
    clientType: ClientType = ClientType.VIEWER
  ): Promise<{ reused: boolean }> {
    // 如果当前 socket 已经连接到某个会话，先移除
    const existingToken = this.socketTokenMap.get(socket.id);
    if (existingToken) {
      await this.removeClientFromSession(socket);
    }

    // 创建客户端实例
    const client = this.createClient(socket, clientType);
    this.clientsBySocketId.set(socket.id, client);
    this.socketTokenMap.set(socket.id, token);

    // 检查是否已有相同 token 的会话
    let session = this.sessionsByToken.get(token);

    if (session) {
      // 复用现有会话
      logger.info(`Reusing existing session for token: ${token}, clientType: ${clientType}`);
      session.addClient(client);
      client.bindSession(session);

      // 向新连接的客户端发送当前状态
      client.onConnected({
        url: '',
        targetId: null,
      });

      return { reused: true };
    } else {
      // 创建新会话
      logger.info(`Creating new session for token: ${token}, clientType: ${clientType}`);
      session = new BrowserSession();
      session.addClient(client);
      this.sessionsByToken.set(token, session);

      // 先绑定 session，这样 connectToBrowser 时事件可以正确传递
      client.bindSession(session);

      await session.connectToBrowser(token);
      return { reused: false };
    }
  }

  /**
   * 从会话移除客户端
   */
  private async removeClientFromSession(socket: Socket): Promise<void> {
    const token = this.socketTokenMap.get(socket.id);
    const client = this.clientsBySocketId.get(socket.id);

    if (token && client) {
      const session = this.sessionsByToken.get(token);
      if (session) {
        client.unbindSession();
        const hasOtherConnections = session.removeClient(client);
        if (!hasOtherConnections) {
          await session.disconnect();
          this.sessionsByToken.delete(token);
          logger.info(`Session for token ${token} destroyed (no more connections)`);
        }
      }
    }

    this.clientsBySocketId.delete(socket.id);
    this.socketTokenMap.delete(socket.id);
  }

  /**
   * 断开 socket 的浏览器连接
   */
  async disconnectBrowser(socket: Socket): Promise<void> {
    await this.removeClientFromSession(socket);
  }

  /**
   * 处理 socket 断开连接
   */
  async handleSocketDisconnect(socket: Socket): Promise<void> {
    logger.info(`Client disconnected: ${socket.id}`);
    await this.removeClientFromSession(socket);
  }
}

// 导出单例
export const sessionManager = new SessionManager();
