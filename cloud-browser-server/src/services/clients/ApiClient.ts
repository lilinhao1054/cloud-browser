import type { Socket } from 'socket.io';
import type { SocketCallback } from '../../types';
import { BaseClient, ClientType, EventHandlerMap } from './BaseClient';
import { successResponse, errorResponse, logger } from '../../utils';

/**
 * API 客户端
 * 支持 getSnapshot、getScreenshot
 * 继承基类的导航和页面管理功能
 * 不接收帧流
 */
export class ApiClient extends BaseClient {
  readonly type: ClientType = ClientType.API;

  constructor(socket: Socket) {
    super(socket);
  }

  /**
   * 通过 backendNodeId 点击元素
   */
  private handleClick = async (data: { backendNodeId: number }, callback?: SocketCallback): Promise<void> => {
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.click(data.backendNodeId);
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  /**
   * 通过 backendNodeId 填充输入框
   */
  private handleFill = async (data: { backendNodeId: number; value: string }, callback?: SocketCallback): Promise<void> => {
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.fill(data.backendNodeId, data.value);
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  /**
   * 获取页面快照
   */
  private handleGetSnapshot = async (callback?: SocketCallback): Promise<void> => {
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      const result = await this.session.getSnapshot();
      if (result) {
        callback?.(successResponse(result));
      } else {
        callback?.(errorResponse('Failed to get snapshot'));
      }
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  /**
   * 获取页面截图
   */
  private handleGetScreenshot = async (
    data: { format?: 'jpeg' | 'png' | 'webp'; quality?: number; fullPage?: boolean },
    callback?: SocketCallback
  ): Promise<void> => {
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      const result = await this.session.getScreenshot(data);
      if (result) {
        callback?.(successResponse(result));
      } else {
        callback?.(errorResponse('Failed to get screenshot'));
      }
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  protected getEventHandlerMap(): EventHandlerMap {
    return {
      'browser:click': this.handleClick,
      'browser:fill': this.handleFill,
      'browser:getSnapshot': this.handleGetSnapshot,
      'browser:getScreenshot': this.handleGetScreenshot,
    };
  }

  // API 客户端使用默认空实现，不接收帧流等事件推送
}
