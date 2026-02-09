import { io, Socket } from 'socket.io-client';
import type {
  SocketResponse,
  PageInfo,
  BrowserConnectedData,
  PageListData,
  PageSwitchedData,
} from '../types/index.js';

/**
 * Socket 连接管理器（ApiClient 模式）
 * 管理与 cloud-browser-server 的连接
 * 只暴露 ApiClient 支持的方法
 */
export class SocketManager {
  private socket: Socket | null = null;
  private serverUrl: string;
  private connected = false;
  private browserConnected = false;
  private currentToken: string | null = null;
  private currentUrl: string | null = null;
  private currentTargetId: string | null = null;
  private pageList: PageInfo[] = [];

  constructor(host: string, port: number) {
    this.serverUrl = `http://${host}:${port}`;
  }

  /**
   * 连接到服务器
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io(this.serverUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        reject(new Error(`Connection failed: ${error.message}`));
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        this.browserConnected = false;
      });

      // 监听浏览器事件
      this.setupBrowserEventListeners();

      // 超时处理
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * 断开服务器连接
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.browserConnected = false;
      this.currentToken = null;
    }
  }

  /**
   * 设置浏览器事件监听器
   */
  private setupBrowserEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('browser:connected', (data: BrowserConnectedData) => {
      this.browserConnected = true;
      this.currentUrl = data.url;
      this.currentTargetId = data.targetId;
    });

    this.socket.on('browser:error', (error: string) => {
      console.error('Browser error:', error);
    });

    this.socket.on('browser:urlChanged', (url: string) => {
      this.currentUrl = url;
    });

    this.socket.on('browser:pageList', (data: PageListData) => {
      this.pageList = data.pages;
      this.currentTargetId = data.activeTargetId;
    });

    this.socket.on('browser:pageCreated', (page: PageInfo) => {
      this.pageList.push(page);
    });

    this.socket.on('browser:pageDestroyed', (data: { targetId: string }) => {
      this.pageList = this.pageList.filter((p) => p.targetId !== data.targetId);
    });

    this.socket.on('browser:pageInfoChanged', (page: PageInfo) => {
      const index = this.pageList.findIndex((p) => p.targetId === page.targetId);
      if (index >= 0) {
        this.pageList[index] = page;
      }
    });

    this.socket.on('browser:pageSwitched', (data: PageSwitchedData) => {
      this.currentTargetId = data.targetId;
      this.currentUrl = data.url;
    });
  }

  /**
   * 连接到浏览器（使用 ApiClient 类型）
   */
  async connectBrowser(token: string): Promise<SocketResponse<BrowserConnectedData>> {
    this.ensureConnected();
    return new Promise((resolve) => {
      this.socket!.emit(
        'browser:connect',
        { token, clientType: 'api' },
        (response: SocketResponse<BrowserConnectedData>) => {
          if (response.success) {
            this.currentToken = token;
            this.browserConnected = true;
            if (response.data) {
              this.currentUrl = response.data.url;
              this.currentTargetId = response.data.targetId;
            }
          }
          resolve(response);
        }
      );
    });
  }

  /**
   * 断开浏览器连接
   */
  async disconnectBrowser(): Promise<SocketResponse> {
    this.ensureConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:disconnect', (response: SocketResponse) => {
        this.browserConnected = false;
        this.currentToken = null;
        this.currentUrl = null;
        this.currentTargetId = null;
        this.pageList = [];
        resolve(response);
      });
    });
  }

  // ========== BaseClient 基础方法 ==========

  /**
   * 导航到 URL
   */
  async navigate(url: string): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:navigate', url, (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * 后退
   */
  async goBack(): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:goBack', (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * 前进
   */
  async goForward(): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:goForward', (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * 刷新
   */
  async reload(): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:reload', (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * 切换页面
   */
  async switchPage(targetId: string): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:switchPage', targetId, (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * 新建页面
   */
  async newPage(url?: string): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:newPage', url, (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * 关闭页面
   */
  async closePage(targetId: string): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:closePage', targetId, (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * 坐标点击（BaseClient 方法）
   */
  async clickAt(x: number, y: number): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:clickAt', { x, y }, (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  // ========== ApiClient 特有方法 ==========

  /**
   * 通过 backendNodeId 点击元素
   * @param backendNodeId 元素的 backendNodeId，来自 accessibility snapshot 的 backendDOMNodeId 字段
   */
  async click(backendNodeId: number): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:click', { backendNodeId }, (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * 通过 backendNodeId 填充输入框
   * @param backendNodeId 元素的 backendNodeId，来自 accessibility snapshot 的 backendDOMNodeId 字段
   * @param value 要填充的值
   */
  async fill(backendNodeId: number, value: string): Promise<SocketResponse> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:fill', { backendNodeId, value }, (response: SocketResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * 获取页面快照（Accessibility Tree）
   */
  async getSnapshot(): Promise<SocketResponse<{ snapshot: unknown }>> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit('browser:getSnapshot', (response: SocketResponse<{ snapshot: unknown }>) => {
        resolve(response);
      });
    });
  }

  /**
   * 获取页面截图
   */
  async getScreenshot(options?: {
    format?: 'jpeg' | 'png' | 'webp';
    quality?: number;
    fullPage?: boolean;
  }): Promise<SocketResponse<{ data: string; format: string }>> {
    this.ensureBrowserConnected();
    return new Promise((resolve) => {
      this.socket!.emit(
        'browser:getScreenshot',
        options || {},
        (response: SocketResponse<{ data: string; format: string }>) => {
          resolve(response);
        }
      );
    });
  }

  /**
   * 等待指定文本出现在页面上
   */
  async waitForText(text: string, timeout = 30000): Promise<SocketResponse<{ found: boolean }>> {
    this.ensureBrowserConnected();
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeout) {
      const snapshotResult = await this.getSnapshot();
      if (snapshotResult.success && snapshotResult.data) {
        const snapshotStr = JSON.stringify(snapshotResult.data.snapshot);
        if (snapshotStr.includes(text)) {
          return { success: true, data: { found: true } };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return { success: false, message: `Timeout waiting for text: "${text}"` };
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    connected: boolean;
    browserConnected: boolean;
    currentToken: string | null;
    currentUrl: string | null;
    currentTargetId: string | null;
    pageList: PageInfo[];
  } {
    return {
      connected: this.connected,
      browserConnected: this.browserConnected,
      currentToken: this.currentToken,
      currentUrl: this.currentUrl,
      currentTargetId: this.currentTargetId,
      pageList: [...this.pageList],
    };
  }

  /**
   * 确保已连接到服务器
   */
  private ensureConnected(): void {
    if (!this.socket || !this.connected) {
      throw new Error('Not connected to server');
    }
  }

  /**
   * 确保已连接到浏览器
   */
  private ensureBrowserConnected(): void {
    this.ensureConnected();
    if (!this.browserConnected) {
      throw new Error('Not connected to browser');
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 检查是否已连接到浏览器
   */
  isBrowserConnected(): boolean {
    return this.browserConnected;
  }
}
