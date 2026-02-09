/**
 * CloudBrowserSDK 类型定义
 */

/** 客户端类型 */
export enum ClientType {
  /** 浏览器查看客户端，接收帧流、处理交互 */
  VIEWER = 'viewer',
  /** API 客户端，只支持 getSnapshot/getScreenshot */
  API = 'api',
}

/** 键盘修饰键 */
export interface KeyModifiers {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

/** 页面信息 */
export interface PageInfo {
  targetId: string;
  url: string;
  title: string;
}

/** 页面列表数据 */
export interface PageListData {
  pages: PageInfo[];
  activeTargetId: string;
}

/** 浏览器连接数据 */
export interface BrowserConnectedData {
  url: string;
  targetId: string;
}

/** 页面切换数据 */
export interface PageSwitchedData {
  targetId: string;
  url: string;
}

/** Socket 层配置 */
export interface SocketOptions {
  /** Socket.IO 服务地址 */
  serverUrl: string;
}

/** 渲染层配置 */
export interface RendererOptions {
  /** 渲染容器元素 */
  container: HTMLElement;
  /** 画面宽度 */
  width?: number;
  /** 画面高度 */
  height?: number;
}

/** SDK 完整配置 */
export interface CloudBrowserSDKOptions extends SocketOptions, RendererOptions {}

/** SDK 事件类型 */
export interface CloudBrowserEvents {
  // 连接事件
  'connected': [];
  'disconnected': [];
  'error': [error: string];
  
  // 浏览器事件
  'browser:connected': [data: BrowserConnectedData];
  'browser:disconnected': [];
  'browser:error': [error: string];
  
  // 页面事件
  'page:list': [data: PageListData];
  'page:created': [page: PageInfo];
  'page:destroyed': [targetId: string];
  'page:infoChanged': [page: PageInfo];
  'page:switched': [data: PageSwitchedData];
  
  // 导航事件
  'url:changed': [url: string];

  // 文件上传事件
  'fileInput:detected': [nodeId: number];
}

/** 渲染层事件类型 */
export interface RendererEvents {
  'click': [x: number, y: number];
  'mouseMove': [x: number, y: number];
  'scroll': [x: number, y: number, deltaX: number, deltaY: number];
  'keyDown': [key: string, code: string, modifiers: KeyModifiers];
  'keyUp': [key: string, code: string, modifiers: KeyModifiers];
  'imeCompositionStart': [];
  'imeCompositionUpdate': [text: string, selectionStart: number, selectionEnd: number];
  'imeCompositionEnd': [text: string];
}

/** Socket 操作响应 */
export interface SocketResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

/** 默认超时时间（毫秒） */
export const DEFAULT_TIMEOUT = 10000;
