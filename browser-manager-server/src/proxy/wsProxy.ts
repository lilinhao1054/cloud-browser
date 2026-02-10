import http from 'http';
import httpProxy from 'http-proxy';
import { URL } from 'url';
import { browserManager } from '../services/BrowserManager';
import logger from '../utils/logger';

const wsProxy = httpProxy.createProxyServer();

wsProxy.on('error', (err) => {
  logger.error(`Proxy error: ${err.message}`);
});

export function setupWsProxy(server: http.Server): void {
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.destroy();
      return;
    }

    const browser = browserManager.get(token);
    if (!browser) {
      socket.destroy();
      return;
    }

    const wsEndpoint = browser.wsEndpoint();
    const targetUrl = new URL(wsEndpoint);

    // /browser?token=xxx => 代理到浏览器的 wsEndpoint
    // 使用 flatten 模式，所有页面通过 sessionId 多路复用，无需单独的页面 ws 端点
    if (url.pathname === '/browser') {
      req.url = targetUrl.pathname;
      req.headers.host = targetUrl.host;

      logger.info(`Browser WS proxy: ${url.pathname} => ${wsEndpoint}`);

      wsProxy.ws(req, socket, head, {
        target: `ws://${targetUrl.host}`,
        ws: true,
      });
      return;
    }

    socket.destroy();
  });
}
