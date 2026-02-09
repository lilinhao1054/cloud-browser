// Socket 响应类型
export interface SocketResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

// 页面信息
export interface PageInfo {
  targetId: string;
  url: string;
  title: string;
}

// 浏览器连接信息
export interface BrowserConnectedData {
  url: string;
  targetId: string;
}

// 页面列表数据
export interface PageListData {
  pages: PageInfo[];
  activeTargetId: string;
}

// 页面切换数据
export interface PageSwitchedData {
  targetId: string;
  url: string;
}

// MCP 配置
export interface MCPConfig {
  serverHost: string;
  serverPort: number;
}
