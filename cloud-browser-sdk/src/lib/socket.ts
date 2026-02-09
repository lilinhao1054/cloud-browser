/**
 * Socket 层 - 负责与后端保持 Socket 连接
 */
import { io, Socket as SocketIO } from 'socket.io-client';
import EventEmitter from 'eventemitter3';
import type { 
  SocketOptions, 
  CloudBrowserEvents,
  PageInfo,
  PageListData,
  BrowserConnectedData,
  PageSwitchedData,
  KeyModifiers,
  SocketResponse
} from './types';
import { DEFAULT_TIMEOUT, ClientType } from './types';

export class Socket extends EventEmitter<CloudBrowserEvents> {
  private socket: SocketIO | null = null;
  private options: SocketOptions;
  private _connected: boolean = false;
  private _browserConnected: boolean = false;

  constructor(options: SocketOptions) {
    super();
    this.options = options;
  }

  /**
   * 发送带回调的 socket 消息
   * @param event 事件名
   * @param data 数据
   * @param timeout 超时时间
   */
  private emitWithAck<T = unknown>(
    event: string, 
    data?: unknown, 
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<SocketResponse<T>> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error(`Operation timeout: ${event}`));
      }, timeout);

      this.socket.emit(event, data, (response: SocketResponse<T>) => {
        clearTimeout(timer);
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message || 'Operation failed'));
        }
      });
    });
  }

  /**
   * 发送不需要回调的 socket 消息（如鼠标移动等高频事件）
   */
  private emitNoAck(event: string, data?: unknown): void {
    this.socket?.emit(event, data);
  }

  /**
   * 连接到服务器
   */
  connect(): void {
    if (this.socket) {
      return;
    }

    this.socket = io(this.options.serverUrl, {
      transports: ['websocket'],
    });

    this.setupSocketListeners();
  }

  /**
   * 设置 Socket 事件监听
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    // 连接事件
    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server');
      this._connected = true;
      this.emit('connected');
    });

    this.socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
      this._connected = false;
      this._browserConnected = false;
      this.emit('disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
      this.emit('error', error.message);
    });

    // 浏览器连接成功
    this.socket.on('browser:connected', (data: BrowserConnectedData) => {
      this._browserConnected = true;
      this.emit('browser:connected', data);
    });

    // 浏览器错误
    this.socket.on('browser:error', (error: string) => {
      this.emit('browser:error', error);
    });

    // URL 变化
    this.socket.on('browser:urlChanged', (url: string) => {
      this.emit('url:changed', url);
    });

    // 页面列表更新
    this.socket.on('browser:pageList', (data: PageListData) => {
      this.emit('page:list', data);
    });

    // 新页面创建
    this.socket.on('browser:pageCreated', (page: PageInfo) => {
      this.emit('page:created', page);
    });

    // 页面销毁
    this.socket.on('browser:pageDestroyed', (data: { targetId: string }) => {
      this.emit('page:destroyed', data.targetId);
    });

    // 页面信息变化
    this.socket.on('browser:pageInfoChanged', (page: PageInfo) => {
      this.emit('page:infoChanged', page);
    });

    // 页面切换完成
    this.socket.on('browser:pageSwitched', (data: PageSwitchedData) => {
      this.emit('page:switched', data);
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this._connected = false;
      this._browserConnected = false;
    }
  }

  /**
   * 获取连接状态
   */
  get connected(): boolean {
    return this._connected;
  }

  /**
   * 获取浏览器连接状态
   */
  get browserConnected(): boolean {
    return this._browserConnected;
  }

  /**
   * 设置浏览器连接状态
   */
  set browserConnected(value: boolean) {
    this._browserConnected = value;
  }

  /**
   * 获取 Socket 实例（用于帧监听）
   */
  getSocket(): SocketIO | null {
    return this.socket;
  }

  /**
   * 获取 Socket ID
   */
  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  // ========== 浏览器控制方法 ==========

  /**
   * 连接浏览器
   * @param token 浏览器 token
   * @param clientType 客户端类型，默认为 viewer
   */
  connectBrowser(token: string, clientType: ClientType = ClientType.VIEWER): Promise<SocketResponse<BrowserConnectedData>> {
    return this.emitWithAck<BrowserConnectedData>('browser:connect', { token, clientType });
  }

  /**
   * 断开浏览器连接
   * 注意：断开连接不需要等待响应，直接发送即可
   */
  disconnectBrowser(): void {
    this._browserConnected = false;
    this.emitNoAck('browser:disconnect');
  }

  /**
   * 导航到指定 URL
   */
  navigate(url: string): Promise<SocketResponse> {
    return this.emitWithAck('browser:navigate', url);
  }

  /**
   * 后退
   */
  goBack(): Promise<SocketResponse> {
    return this.emitWithAck('browser:goBack');
  }

  /**
   * 前进
   */
  goForward(): Promise<SocketResponse> {
    return this.emitWithAck('browser:goForward');
  }

  /**
   * 刷新
   */
  reload(): Promise<SocketResponse> {
    return this.emitWithAck('browser:reload');
  }

  // ========== 页面管理方法 ==========

  /**
   * 切换到指定页面
   */
  switchPage(targetId: string): Promise<SocketResponse<PageSwitchedData>> {
    return this.emitWithAck<PageSwitchedData>('browser:switchPage', targetId);
  }

  /**
   * 创建新页面
   */
  createNewPage(url?: string): Promise<SocketResponse<{ targetId: string }>> {
    return this.emitWithAck<{ targetId: string }>('browser:newPage', url);
  }

  /**
   * 关闭页面
   */
  closePage(targetId: string): Promise<SocketResponse> {
    return this.emitWithAck('browser:closePage', targetId);
  }

  // ========== 交互事件方法（高频事件，不需要回调） ==========

  /**
   * 发送点击事件（带响应，用于检测 file input）
   */
  sendClickAt(x: number, y: number): Promise<SocketResponse<{ isFileInput?: boolean; nodeId?: number }>> {
    return this.emitWithAck<{ isFileInput?: boolean; nodeId?: number }>('browser:clickAt', { x, y });
  }

  /**
   * 发送鼠标移动事件
   */
  sendMouseMove(x: number, y: number): void {
    this.emitNoAck('browser:mouseMove', { x, y });
  }

  /**
   * 发送滚动事件
   */
  sendScroll(x: number, y: number, deltaX: number, deltaY: number): void {
    this.emitNoAck('browser:scroll', { x, y, deltaX, deltaY });
  }

  /**
   * 发送键盘按下事件
   */
  sendKeyDown(key: string, code: string, modifiers: KeyModifiers): void {
    this.emitNoAck('browser:keyDown', { key, code, modifiers });
  }

  /**
   * 发送键盘释放事件
   */
  sendKeyUp(key: string, code: string, modifiers: KeyModifiers): void {
    this.emitNoAck('browser:keyUp', { key, code, modifiers });
  }

  /**
   * 发送 IME 组合更新事件（拼音输入时）
   */
  sendImeSetComposition(text: string, selectionStart: number, selectionEnd: number): void {
    this.emitNoAck('browser:imeSetComposition', { text, selectionStart, selectionEnd });
  }

  /**
   * 发送 IME 提交事件（选中候选词后）
   */
  sendImeCommitComposition(text: string): void {
    this.emitNoAck('browser:imeCommitComposition', { text });
  }

  /**
   * 直接插入文本
   */
  sendInsertText(text: string): void {
    this.emitNoAck('browser:insertText', { text });
  }
}
