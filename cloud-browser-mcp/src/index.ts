#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SocketManager } from './socket/SocketManager.js';

// 解析命令行参数
function parseArgs(): { host: string; port: number } {
  const args = process.argv.slice(2);
  let host = 'localhost';
  let port = 4000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && args[i + 1]) {
      host = args[i + 1];
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { host, port };
}

const { host, port } = parseArgs();

// 创建 Socket 管理器
const socketManager = new SocketManager(host, port);

// 定义所有 tools（只暴露 ApiClient 支持的方法）
const TOOLS = [
  // 浏览器管理相关
  {
    name: 'list_browsers',
    description: '获取所有可用的浏览器 token 列表',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'start_browser',
    description: '启动一个新的浏览器实例，返回 token',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'stop_browser',
    description: '关闭指定的浏览器实例',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: '浏览器 token',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'connect_browser',
    description: '连接到指定的浏览器实例（使用 ApiClient 模式）',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: {
          type: 'string',
          description: '浏览器 token',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'disconnect_browser',
    description: '断开当前浏览器连接',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_browser_status',
    description: '获取当前浏览器连接状态',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // 导航相关（BaseClient）
  {
    name: 'navigate',
    description: '导航到指定 URL',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: '目标 URL',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'go_back',
    description: '浏览器后退',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'go_forward',
    description: '浏览器前进',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'reload',
    description: '刷新当前页面',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // 页面管理相关（BaseClient）
  {
    name: 'new_page',
    description: '创建新页面/标签页',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: '可选的初始 URL',
        },
      },
      required: [],
    },
  },
  {
    name: 'switch_page',
    description: '切换到指定页面',
    inputSchema: {
      type: 'object' as const,
      properties: {
        targetId: {
          type: 'string',
          description: '目标页面的 targetId',
        },
      },
      required: ['targetId'],
    },
  },
  {
    name: 'close_page',
    description: '关闭指定页面',
    inputSchema: {
      type: 'object' as const,
      properties: {
        targetId: {
          type: 'string',
          description: '要关闭页面的 targetId',
        },
      },
      required: ['targetId'],
    },
  },
  {
    name: 'get_page_list',
    description: '获取当前所有打开的页面列表',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // 交互操作（ApiClient）
  {
    name: 'click',
    description: '通过 backendNodeId 点击元素。backendNodeId 从 take_snapshot 返回的快照中获取：每行格式为 "uid=depth_backendNodeId role name"，下划线后的数字就是 backendNodeId。例如 "uid=9_6804 link VIP会员" 中 backendNodeId 是 6804',
    inputSchema: {
      type: 'object' as const,
      properties: {
        backendNodeId: {
          type: 'number',
          description: '元素的 backendNodeId，从 take_snapshot 返回的 uid 中提取，格式为 uid=depth_backendNodeId，取下划线后的数字',
        },
      },
      required: ['backendNodeId'],
    },
  },
  {
    name: 'click_at',
    description: '在指定坐标点击',
    inputSchema: {
      type: 'object' as const,
      properties: {
        x: {
          type: 'number',
          description: 'X 坐标',
        },
        y: {
          type: 'number',
          description: 'Y 坐标',
        },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'fill',
    description: '通过 backendNodeId 填充输入框（先聚焦元素，清空内容，然后插入文本）。backendNodeId 从 take_snapshot 返回的快照中获取：每行格式为 "uid=depth_backendNodeId role name"，下划线后的数字就是 backendNodeId。例如 "uid=12_6346 textbox" 中 backendNodeId 是 6346',
    inputSchema: {
      type: 'object' as const,
      properties: {
        backendNodeId: {
          type: 'number',
          description: '输入框元素的 backendNodeId，从 take_snapshot 返回的 uid 中提取，格式为 uid=depth_backendNodeId，取下划线后的数字',
        },
        value: {
          type: 'string',
          description: '要填充的文本值',
        },
      },
      required: ['backendNodeId', 'value'],
    },
  },

  // 等待
  {
    name: 'wait_for',
    description: '等待指定文本出现在当前页面上',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: '要等待出现的文本',
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒），默认 30000',
        },
      },
      required: ['text'],
    },
  },

  // 页面信息获取（ApiClient）
  {
    name: 'take_snapshot',
    description: '获取页面的 Accessibility Tree 快照，用于理解页面结构和定位元素。返回压缩格式，每行格式为 "uid=depth_backendNodeId role name [attributes]"。其中下划线后的数字是 backendNodeId，可直接用于 click 和 fill 操作。例如 "uid=9_6804 link VIP会员" 表示一个链接元素，backendNodeId=6804。只有当 snapshot 无法获取所需信息时才使用 take_screenshot',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'take_screenshot',
    description: '获取页面截图。仅当 take_snapshot 无法提供所需信息时使用（如需要查看视觉布局、图片内容等）',
    inputSchema: {
      type: 'object' as const,
      properties: {
        format: {
          type: 'string',
          description: '图片格式: jpeg, png, webp',
          enum: ['jpeg', 'png', 'webp'],
        },
        quality: {
          type: 'number',
          description: '图片质量 (1-100)，仅对 jpeg/webp 有效',
        },
        fullPage: {
          type: 'boolean',
          description: '是否截取完整页面（包括滚动区域）',
        },
      },
      required: [],
    },
  },
];

// 创建 MCP Server
const server = new Server(
  {
    name: 'cloud-browser-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 处理 list tools 请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// HTTP API 辅助函数
async function httpRequest(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<{ success: boolean; data?: unknown; message?: string }> {
  const url = `http://${host}:${port}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  return response.json();
}

// 处理 tool 调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // 浏览器管理
      case 'list_browsers': {
        const result = await httpRequest('GET', '/list');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'start_browser': {
        const result = await httpRequest('POST', '/start');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'stop_browser': {
        const { token } = args as { token: string };
        const result = await httpRequest('POST', '/stop', { token });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'connect_browser': {
        const { token } = args as { token: string };
        // 确保先连接到 server
        if (!socketManager.isConnected()) {
          await socketManager.connect();
        }
        const result = await socketManager.connectBrowser(token);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'disconnect_browser': {
        if (!socketManager.isBrowserConnected()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: false, message: 'Not connected to browser' }),
              },
            ],
          };
        }
        const result = await socketManager.disconnectBrowser();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_browser_status': {
        const status = socketManager.getStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      }

      // 导航
      case 'navigate': {
        const { url } = args as { url: string };
        const result = await socketManager.navigate(url);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'go_back': {
        const result = await socketManager.goBack();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'go_forward': {
        const result = await socketManager.goForward();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'reload': {
        const result = await socketManager.reload();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // 页面管理
      case 'new_page': {
        const { url } = args as { url?: string };
        const result = await socketManager.newPage(url);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'switch_page': {
        const { targetId } = args as { targetId: string };
        const result = await socketManager.switchPage(targetId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'close_page': {
        const { targetId } = args as { targetId: string };
        const result = await socketManager.closePage(targetId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_page_list': {
        const status = socketManager.getStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  data: {
                    pages: status.pageList,
                    activeTargetId: status.currentTargetId,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // 交互操作
      case 'click': {
        const { backendNodeId } = args as { backendNodeId: number };
        const result = await socketManager.click(backendNodeId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'click_at': {
        const { x, y } = args as { x: number; y: number };
        const result = await socketManager.clickAt(x, y);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'fill': {
        const { backendNodeId, value } = args as { backendNodeId: number; value: string };
        const result = await socketManager.fill(backendNodeId, value);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'wait_for': {
        const { text, timeout } = args as { text: string; timeout?: number };
        const result = await socketManager.waitForText(text, timeout);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'take_snapshot': {
        const result = await socketManager.getSnapshot();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'take_screenshot': {
        const { format, quality, fullPage } = args as {
          format?: 'jpeg' | 'png' | 'webp';
          quality?: number;
          fullPage?: boolean;
        };
        const result = await socketManager.getScreenshot({ format, quality, fullPage });
        if (result.success && result.data) {
          return {
            content: [
              {
                type: 'image',
                data: result.data.data,
                mimeType: `image/${result.data.format}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: false, message: `Unknown tool: ${name}` }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, message: errorMessage }),
        },
      ],
      isError: true,
    };
  }
});

// 启动服务
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Cloud Browser MCP Server started, connecting to ${host}:${port}`);
}

main().catch(console.error);
