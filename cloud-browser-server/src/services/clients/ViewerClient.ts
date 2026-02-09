import type { Socket } from 'socket.io';
import type { KeyModifiers } from '../../types';
import { BaseClient, ClientType, EventHandlerMap } from './BaseClient';
import { logger } from '../../utils';

/**
 * 浏览器查看客户端
 * 接收帧流、处理用户交互（点击、键盘、滚动等）
 */
export class ViewerClient extends BaseClient {
  readonly type: ClientType = ClientType.VIEWER;

  constructor(socket: Socket) {
    super(socket);
  }

  // ========== 事件处理器（箭头函数保持 this 绑定）==========

  private handleMouseMove = async (data: { x: number; y: number }) => {
    if (this.session) {
      await this.session.mouseMove(data.x, data.y);
    }
  };

  private handleScroll = async (data: { x: number; y: number; deltaX: number; deltaY: number }) => {
    if (this.session) {
      await this.session.scroll(data.x, data.y, data.deltaX, data.deltaY);
    }
  };

  private handleKeyDown = async (data: { key: string; code: string; modifiers: KeyModifiers }) => {
    if (this.session) {
      await this.session.keyDown(data.key, data.code, data.modifiers);
    }
  };

  private handleKeyUp = async (data: { key: string; code: string; modifiers: KeyModifiers }) => {
    if (this.session) {
      await this.session.keyUp(data.key, data.code, data.modifiers);
    }
  };

  private handleImeSetComposition = async (data: { text: string; selectionStart: number; selectionEnd: number }) => {
    if (this.session) {
      await this.session.imeSetComposition(data.text, data.selectionStart, data.selectionEnd);
    }
  };

  private handleImeCommitComposition = async (data: { text: string }) => {
    logger.info(`IME commit composition for ${this.socket.id}, text: ${data.text}`);
    if (this.session) {
      await this.session.imeCommitComposition(data.text);
    }
  };

  private handleInsertText = async (data: { text: string }) => {
    logger.info(`Insert text for ${this.socket.id}, text: ${data.text}`);
    if (this.session) {
      await this.session.insertText(data.text);
    }
  };

  protected getEventHandlerMap(): EventHandlerMap {
    return {
      'browser:mouseMove': this.handleMouseMove,
      'browser:scroll': this.handleScroll,
      'browser:keyDown': this.handleKeyDown,
      'browser:keyUp': this.handleKeyUp,
      'browser:imeSetComposition': this.handleImeSetComposition,
      'browser:imeCommitComposition': this.handleImeCommitComposition,
      'browser:insertText': this.handleInsertText,
    };
  }

  // ========== 覆盖事件回调 ==========

  onFrame(data: string): void {
    this.socket.emit('browser:frame', data);
  }

  onUrlChanged(url: string): void {
    this.socket.emit('browser:urlChanged', url);
  }

  onConnected(data: { url: string; targetId: string | null }): void {
    this.socket.emit('browser:connected', data);
  }

  onPageCreated(data: { targetId: string; url: string; title: string }): void {
    this.socket.emit('browser:pageCreated', data);
  }

  onPageDestroyed(data: { targetId: string }): void {
    this.socket.emit('browser:pageDestroyed', data);
  }

  onPageInfoChanged(data: { targetId: string; url: string; title: string }): void {
    this.socket.emit('browser:pageInfoChanged', data);
  }

  onPageSwitched(data: { targetId: string; url: string }): void {
    this.socket.emit('browser:pageSwitched', data);
  }

  onPageList(data: { pages: unknown[]; activeTargetId: string | null }): void {
    this.socket.emit('browser:pageList', data);
  }

  onError(message: string): void {
    this.socket.emit('browser:error', message);
  }
}
