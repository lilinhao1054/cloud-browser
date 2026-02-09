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

    // /page/${targetId}?token=xxx => 代理到页面的 devtools ws
    const pageMatch = url.pathname.match(/^\/page\/(.+)$/);
    if (pageMatch) {
      const targetId = pageMatch[1];
      const pageWsPath = `/devtools/page/${targetId}`;

      req.url = pageWsPath;
      req.headers.host = targetUrl.host;

      logger.info(`Page WS proxy: ${url.pathname} => ws://${targetUrl.host}${pageWsPath}`);

      wsProxy.ws(req, socket, head, {
        target: `ws://${targetUrl.host}`,
        ws: true,
      });
      return;
    }

    socket.destroy();
  });
}
