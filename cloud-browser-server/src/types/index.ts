import type { Socket } from 'socket.io';

// Socket 响应类型
export interface SocketResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

// 键盘修饰键类型
export interface KeyModifiers {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

// 页面信息接口
export interface PageInfo {
  targetId: string;
  url: string;
  title: string;
}

// Socket 回调类型
export type SocketCallback<T = unknown> = (res: SocketResponse<T>) => void;

// 带 callback 的 Socket 类型
export type SocketWithCallback = Socket;
