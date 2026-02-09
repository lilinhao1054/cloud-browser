/**
 * CloudBrowserSDK - 云浏览器 SDK
 * 
 * 架构说明：
 * - Socket 层：负责与后端保持 Socket 连接，触发回调对应事件
 * - Renderer 层：负责云浏览器画面的渲染和交互
 * 
 * 使用示例：
 * ```typescript
 * const sdk = new CloudBrowserSDK({
 *   serverUrl: 'http://localhost:4000',
 *   container: document.getElementById('browser-container')!,
 * });
 * 
 * // 监听事件
 * sdk.on('browser:connected', (data) => {
 *   console.log('Browser connected:', data);
 * });
 * 
 * sdk.on('url:changed', (url) => {
 *   console.log('URL changed:', url);
 * });
 * 
 * // 连接并启动
 * sdk.connect();
 * sdk.startBrowser();
 * 
 * // 导航
 * sdk.navigate('https://example.com');
 * ```
 */

import { Socket } from './socket';
import { Renderer } from './renderer';
import type { 
  CloudBrowserSDKOptions, 
  CloudBrowserEvents,
  SocketResponse,
  BrowserConnectedData,
  PageSwitchedData
} from './types';
import { ClientType } from './types';

export type { SocketResponse } from './types';

export class CloudBrowserSDK {
  private socket: Socket;
  private renderer: Renderer;
  private frameHandler: ((data: string) => void) | null = null;
  private options: CloudBrowserSDKOptions;
  private pendingFileInputNodeId: number | null = null;

  constructor(options: CloudBrowserSDKOptions) {
    this.options = options;
    
    // 初始化 Socket 层
    this.socket = new Socket({
      serverUrl: options.serverUrl,
    });

    // 初始化渲染层
    this.renderer = new Renderer({
      container: options.container,
      width: options.width,
      height: options.height,
    });

    // 连接渲染层交互事件到 Socket 层
    this.setupRendererToSocketBridge();
  }

  /**
   * 建立渲染层到 Socket 层的事件桥接
   */
  private setupRendererToSocketBridge(): void {
    // 渲染层点击事件 -> Socket 层发送，检测 file input
    this.renderer.on('click', async (x, y) => {
      try {
        const response = await this.socket.sendClickAt(x, y);
        if (response.data?.isFileInput && response.data?.nodeId) {
          // 检测到 file input，触发事件让外部处理
          this.pendingFileInputNodeId = response.data.nodeId;
          this.socket.emit('fileInput:detected', response.data.nodeId);
        }
      } catch (error) {
        console.error('Click error:', error);
      }
    });

    this.renderer.on('mouseMove', (x, y) => {
      this.socket.sendMouseMove(x, y);
    });

    this.renderer.on('scroll', (x, y, deltaX, deltaY) => {
      this.socket.sendScroll(x, y, deltaX, deltaY);
    });

    this.renderer.on('keyDown', (key, code, modifiers) => {
      this.socket.sendKeyDown(key, code, modifiers);
    });

    this.renderer.on('keyUp', (key, code, modifiers) => {
      this.socket.sendKeyUp(key, code, modifiers);
    });

    // IME 事件桥接
    this.renderer.on('imeCompositionUpdate', (text, selectionStart, selectionEnd) => {
      this.socket.sendImeSetComposition(text, selectionStart, selectionEnd);
    });

    this.renderer.on('imeCompositionEnd', (text) => {
      this.socket.sendImeCommitComposition(text);
    });
  }

  /**
   * 设置帧数据监听
   */
  private setupFrameListener(): void {
    const socketIO = this.socket.getSocket();
    if (socketIO && !this.frameHandler) {
      this.frameHandler = (data: string) => {
        this.renderer.renderFrame(data);
      };
      socketIO.on('browser:frame', this.frameHandler);
    }
  }

  /**
   * 移除帧数据监听
   */
  private removeFrameListener(): void {
    const socketIO = this.socket.getSocket();
    if (socketIO && this.frameHandler) {
      socketIO.off('browser:frame', this.frameHandler);
      this.frameHandler = null;
    }
  }

  // ========== 事件监听 ==========

  /**
   * 监听 SDK 事件
   */
  on<K extends keyof CloudBrowserEvents>(
    event: K, 
    callback: (...args: CloudBrowserEvents[K]) => void
  ): this {
    this.socket.on(event, callback as any);
    return this;
  }

  /**
   * 取消事件监听
   */
  off<K extends keyof CloudBrowserEvents>(
    event: K, 
    callback: (...args: CloudBrowserEvents[K]) => void
  ): this {
    this.socket.off(event, callback as any);
    return this;
  }

  // ========== 连接管理 ==========

  /**
   * 连接到服务器
   */
  connect(): void {
    this.socket.connect();
    // 连接后设置帧监听
    this.socket.on('connected', () => {
      this.setupFrameListener();
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.removeFrameListener();
    this.socket.disconnect();
    this.renderer.clear();
  }

  /**
   * 获取连接状态
   */
  get connected(): boolean {
    return this.socket.connected;
  }

  /**
   * 获取浏览器连接状态
   */
  get browserConnected(): boolean {
    return this.socket.browserConnected;
  }

  // ========== 浏览器控制 ==========

  /**
   * 连接浏览器
   * @param token 浏览器 token
   * @param clientType 客户端类型，默认为 viewer
   */
  connectBrowser(token: string, clientType: ClientType = ClientType.VIEWER): Promise<SocketResponse<BrowserConnectedData>> {
    return this.socket.connectBrowser(token, clientType);
  }

  /**
   * 断开浏览器连接
   */
  disconnectBrowser(): void {
    this.renderer.clear();
    this.socket.disconnectBrowser();
  }

  /**
   * 导航到指定 URL
   */
  navigate(url: string): Promise<SocketResponse> {
    // 自动补全协议
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    return this.socket.navigate(finalUrl);
  }

  /**
   * 后退
   */
  goBack(): Promise<SocketResponse> {
    return this.socket.goBack();
  }

  /**
   * 前进
   */
  goForward(): Promise<SocketResponse> {
    return this.socket.goForward();
  }

  /**
   * 刷新
   */
  reload(): Promise<SocketResponse> {
    return this.socket.reload();
  }

  // ========== 页面管理 ==========

  /**
   * 切换到指定页面
   */
  switchPage(targetId: string): Promise<SocketResponse<PageSwitchedData>> {
    return this.socket.switchPage(targetId);
  }

  /**
   * 创建新页面
   */
  createNewPage(url?: string): Promise<SocketResponse<{ targetId: string }>> {
    return this.socket.createNewPage(url);
  }

  /**
   * 关闭页面
   */
  closePage(targetId: string): Promise<SocketResponse> {
    return this.socket.closePage(targetId);
  }

  // ========== 输入方法 ==========

  /**
   * 直接插入文本（不经过键盘事件）
   */
  insertText(text: string): void {
    this.socket.sendInsertText(text);
  }

  // ========== 文件上传 ==========

  /**
   * 获取待上传文件的 nodeId
   */
  getPendingFileInputNodeId(): number | null {
    return this.pendingFileInputNodeId;
  }

  /**
   * 清除待上传文件的 nodeId
   */
  clearPendingFileInputNodeId(): void {
    this.pendingFileInputNodeId = null;
  }

  /**
   * 上传文件到云浏览器的 file input
   */
  async uploadFile(file: File, nodeId?: number): Promise<{ success: boolean; message?: string }> {
    const targetNodeId = nodeId ?? this.pendingFileInputNodeId;
    if (!targetNodeId) {
      return { success: false, message: 'No file input node id' };
    }

    const socketId = this.socket.getSocketId();
    if (!socketId) {
      return { success: false, message: 'Socket not connected' };
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('socketId', socketId);
    formData.append('nodeId', String(targetNodeId));

    try {
      const response = await fetch(`${this.options.serverUrl}/upload`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      
      if (result.success) {
        this.pendingFileInputNodeId = null;
      }
      
      return result;
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  // ========== 其他 ==========

  /**
   * 获取 canvas 元素
   */
  getCanvas(): HTMLCanvasElement {
    return this.renderer.getCanvas();
  }

  /**
   * 销毁 SDK
   */
  destroy(): void {
    this.disconnect();
    this.renderer.destroy();
    this.socket.removeAllListeners();
  }
}

// 导出类型和子模块
export * from './types';
export { Socket } from './socket';
export { Renderer } from './renderer';

export default CloudBrowserSDK;
