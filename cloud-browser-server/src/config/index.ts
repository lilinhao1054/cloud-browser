// 远程浏览器配置（从环境变量读取）
export const END_POINT_HOST = process.env.BROWSER_ENDPOINT_HOST || 'localhost';
export const END_POINT_PORT = parseInt(process.env.BROWSER_ENDPOINT_PORT || '9222', 10);
export const REMOTE_BASE_URL = `http://${END_POINT_HOST}:${END_POINT_PORT}`;

// 服务端口和主机
export const SERVER_PORT = 4000;
export const SERVER_HOST = '0.0.0.0';

// Screencast 配置
export const SCREENCAST_CONFIG = {
  format: 'jpeg' as const,
  quality: parseInt(process.env.SCREENCAST_QUALITY || '60', 10),
  maxWidth: 1280,
  maxHeight: 720,
  everyNthFrame: parseInt(process.env.SCREENCAST_EVERY_NTH_FRAME || '3', 10),
};

// 默认视口大小
export const DEFAULT_VIEWPORT = {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  mobile: false,
};
