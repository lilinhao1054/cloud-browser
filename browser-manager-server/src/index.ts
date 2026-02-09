import http from 'http';
import app from './app';
import { setupWsProxy } from './proxy/wsProxy';
import logger from './utils/logger';

const PORT = 5000;
const HOST = '0.0.0.0';

const server = http.createServer(app.callback());

// 设置 WebSocket 代理
setupWsProxy(server);

server.listen(PORT, HOST, () => {
  logger.info(`Server running on http://${HOST}:${PORT}`);
});

export default server;
