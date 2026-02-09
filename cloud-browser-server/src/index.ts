import 'dotenv/config';
import Koa from 'koa';
import cors from 'koa-cors';
import bodyParser from 'koa-bodyparser';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { SERVER_PORT, SERVER_HOST } from './config';
import { router } from './routes';
import { registerSocketHandlers } from './handlers';
import { logger } from './utils';

// 创建 Koa 应用
const app = new Koa();
const httpServer = createServer(app.callback());

// Socket.IO 服务
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8, // 100MB
});

// 中间件
app.use(cors());
app.use(bodyParser());

// HTTP 路由
app.use(router.routes());
app.use(router.allowedMethods());

// Socket.IO 事件处理
io.on('connection', (socket) => {
  registerSocketHandlers(socket);
});

// 启动服务
httpServer.listen(SERVER_PORT, SERVER_HOST, () => {
  logger.info(`Server is running on http://${SERVER_HOST}:${SERVER_PORT}`);
  logger.info(`Socket.IO is ready for connections`);
});
