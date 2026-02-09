import Router from 'koa-router';
import { REMOTE_BASE_URL } from '../config';
import { sessionManager } from '../services';
import { logger } from '../utils';

const router = new Router();

// 健康检查
router.get('/', (ctx) => {
  ctx.body = { success: true, data: { message: 'Cloud Browser Server is running' } };
});

router.get('/health', (ctx) => {
  ctx.body = { success: true, data: { status: 'ok', timestamp: new Date().toISOString() } };
});

// 启动浏览器 - 转发到远程服务
router.post('/start', async (ctx) => {
  logger.info('HTTP POST /start - Starting browser');
  try {
    const response = await fetch(`${REMOTE_BASE_URL}/start`, {
      method: 'POST',
    });
    const data = await response.json();
    ctx.body = data;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: (error as Error).message };
  }
});

// 停止浏览器 - 转发到远程服务
router.post('/stop', async (ctx) => {
  logger.info('HTTP POST /stop - Stopping browser');
  try {
    const { token } = ctx.request.body as { token?: string };
    if (!token) {
      ctx.status = 400;
      ctx.body = { success: false, message: 'token is required' };
      return;
    }

    // 检查是否有会话正在使用该浏览器
    const session = sessionManager.getSessionByToken(token);
    if (session && session.getClientCount() > 0) {
      ctx.status = 400;
      ctx.body = { success: false, message: '该浏览器正在被使用，请先断开所有连接' };
      return;
    }

    const response = await fetch(`${REMOTE_BASE_URL}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await response.json();
    ctx.body = data;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: (error as Error).message };
  }
});

// 获取浏览器列表 - 转发到远程服务
router.get('/list', async (ctx) => {
  logger.info('HTTP GET /list - Listing browsers');
  try {
    const response = await fetch(`${REMOTE_BASE_URL}/list`);
    const data = await response.json();
    ctx.body = data;
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: (error as Error).message };
  }
});

export { router };
