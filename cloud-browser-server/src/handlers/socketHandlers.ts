import type { Socket } from 'socket.io';
import type { SocketCallback } from '../types';
import { ClientType } from '../services/clients';
import { successResponse, errorResponse, logger } from '../utils';
import { sessionManager } from '../services';

/**
 * 注册所有 Socket.IO 事件处理器
 * 只处理连接和断开，具体事件由各 Client 类自行注册
 */
export function registerSocketHandlers(socket: Socket): void {
  logger.info(`Client connected: ${socket.id}`);

  // 连接浏览器
  socket.on('browser:connect', async (data: { token: string; clientType?: ClientType }, callback?: SocketCallback) => {
    const { token, clientType = ClientType.VIEWER } = data;
    logger.info(`Connecting browser for ${socket.id} with token: ${token}, clientType: ${clientType}`);

    try {
      const result = await sessionManager.connectBrowser(socket, token, clientType);
      callback?.(successResponse(result));
    } catch (error) {
      logger.error('Failed to connect browser:', error);
      callback?.(errorResponse((error as Error).message));
    }
  });

  // 断开浏览器连接
  socket.on('browser:disconnect', async (callback?: SocketCallback) => {
    logger.info(`Disconnecting browser for ${socket.id}`);
    try {
      await sessionManager.disconnectBrowser(socket);
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  });

  // 断开连接时清理
  socket.on('disconnect', async () => {
    await sessionManager.handleSocketDisconnect(socket);
  });
}
