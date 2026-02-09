import type { SocketResponse } from '../types';

// 创建成功响应
export const successResponse = <T>(data?: T): SocketResponse<T> => ({
  success: true,
  data,
});

// 创建失败响应
export const errorResponse = (message: string): SocketResponse => ({
  success: false,
  message,
});
