import type { Socket } from 'socket.io';
import type { BrowserSession } from '../BrowserSession';
import type { SocketCallback } from '../../types';
import { successResponse, errorResponse, logger } from '../../utils';

export enum ClientType {
  VIEWER = 'viewer',
  API = 'api',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler = (...args: any[]) => void;
export type EventHandlerMap = Record<string, EventHandler>;

/**
 * 客户端基类
 * 定义客户端与 BrowserSession 交互的抽象接口
 */
export abstract class BaseClient {
  protected socket: Socket;
  protected session: BrowserSession | null = null;
  abstract readonly type: ClientType;

  // 存储事件处理函数引用，用于注销
  protected eventHandlers: Map<string, EventHandler> = new Map();

  constructor(socket: Socket) {
    this.socket = socket;
  }

  /**
   * 获取 socket
   */
  getSocket(): Socket {
    return this.socket;
  }

  /**
   * 获取 socket id
   */
  getSocketId(): string {
    return this.socket.id;
  }

  /**
   * 绑定到 BrowserSession
   */
  bindSession(session: BrowserSession): void {
    this.session = session;
    this.registerBaseEvents();
    this.registerChildEvents();
    logger.debug(`${this.type} client ${this.socket.id} bindSession`);
  }

  /**
   * 解绑 BrowserSession
   */
  unbindSession(): void {
    this.autoUnregisterEvents();
    this.session = null;
    logger.debug(`${this.type} client ${this.socket.id} unbindSession`);
  }

  // ========== 基础事件 handlers（箭头函数保持 this 绑定）==========

  private handleNavigate = async (url: string, callback?: SocketCallback) => {
    logger.info(`[${this.type}] Navigate to ${url} for ${this.socket.id}`);
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.navigate(url);
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  private handleGoBack = async (callback?: SocketCallback) => {
    logger.info(`[${this.type}] Go back for ${this.socket.id}`);
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.goBack();
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  private handleGoForward = async (callback?: SocketCallback) => {
    logger.info(`[${this.type}] Go forward for ${this.socket.id}`);
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.goForward();
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  private handleReload = async (callback?: SocketCallback) => {
    logger.info(`[${this.type}] Reload for ${this.socket.id}`);
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.reload();
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  private handleSwitchPage = async (targetId: string, callback?: SocketCallback) => {
    logger.debug(`[${this.type}] Switch to page ${targetId} for ${this.socket.id}`);
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.switchToPage(targetId);
      callback?.(successResponse({ targetId }));
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  private handleNewPage = async (url: string | undefined, callback?: SocketCallback) => {
    logger.info(`[${this.type}] Create new page for ${this.socket.id}, url: ${url || 'about:blank'}`);
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.createNewPage(url || 'about:blank');
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  private handleClosePage = async (targetId: string, callback?: SocketCallback) => {
    logger.info(`[${this.type}] Close page ${targetId} for ${this.socket.id}`);
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.closePage(targetId);
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  private handleClickAt = async (data: { x: number; y: number }, callback?: SocketCallback) => {
    logger.info(`[${this.type}] Click at (${data.x}, ${data.y}) for ${this.socket.id}`);
    if (!this.session) {
      callback?.(errorResponse('No browser session'));
      return;
    }
    try {
      await this.session.clickAt(data.x, data.y);
      callback?.(successResponse());
    } catch (error) {
      callback?.(errorResponse((error as Error).message));
    }
  };

  /**
   * 获取基础事件处理器映射
   */
  private getBaseEventHandlerMap(): EventHandlerMap {
    return {
      'browser:navigate': this.handleNavigate,
      'browser:goBack': this.handleGoBack,
      'browser:goForward': this.handleGoForward,
      'browser:reload': this.handleReload,
      'browser:switchPage': this.handleSwitchPage,
      'browser:newPage': this.handleNewPage,
      'browser:closePage': this.handleClosePage,
      'browser:clickAt': this.handleClickAt,
    };
  }

  /**
   * 子类实现：获取特有事件处理器映射
   */
  protected abstract getEventHandlerMap(): EventHandlerMap;

  /**
   * 自动注册事件（根据 handler map）
   */
  protected autoRegisterEvents(handlerMap: EventHandlerMap): void {
    for (const [event, handler] of Object.entries(handlerMap)) {
      this.socket.on(event, handler);
      this.eventHandlers.set(event, handler);
    }
  }

  /**
   * 自动注销所有已注册的事件
   */
  protected autoUnregisterEvents(): void {
    for (const [event, handler] of this.eventHandlers) {
      this.socket.off(event, handler);
    }
    this.eventHandlers.clear();
  }

  /**
   * 注册基础事件
   */
  private registerBaseEvents(): void {
    this.autoRegisterEvents(this.getBaseEventHandlerMap());
    logger.debug(`${this.type} client ${this.socket.id} registered base events`);
  }

  /**
   * 注册子类特有事件
   */
  private registerChildEvents(): void {
    this.autoRegisterEvents(this.getEventHandlerMap());
  }

  // ========== 事件回调（子类可覆盖） ==========

  /**
   * 收到帧数据
   */
  onFrame(data: string): void {
    // 默认空实现
  }

  /**
   * URL 变化
   */
  onUrlChanged(url: string): void {
    // 默认空实现
  }

  /**
   * 浏览器已连接
   */
  onConnected(data: { url: string; targetId: string | null }): void {
    // 默认空实现
  }

  /**
   * 页面创建
   */
  onPageCreated(data: { targetId: string; url: string; title: string }): void {
    // 默认空实现
  }

  /**
   * 页面销毁
   */
  onPageDestroyed(data: { targetId: string }): void {
    // 默认空实现
  }

  /**
   * 页面信息变化
   */
  onPageInfoChanged(data: { targetId: string; url: string; title: string }): void {
    // 默认空实现
  }

  /**
   * 页面切换
   */
  onPageSwitched(data: { targetId: string; url: string }): void {
    // 默认空实现
  }

  /**
   * 页面列表更新
   */
  onPageList(data: { pages: unknown[]; activeTargetId: string | null }): void {
    // 默认空实现
  }

  /**
   * 错误
   */
  onError(message: string): void {
    // 默认空实现
  }
}
