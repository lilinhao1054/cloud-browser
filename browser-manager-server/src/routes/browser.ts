import Router from 'koa-router';
import { browserManager } from '../services/BrowserManager';
import { success, error } from '../types/response';

const router = new Router();

router.post('/start', async (ctx) => {
  try {
    const { token } = await browserManager.start();
    ctx.body = success({ token });
  } catch (err) {
    ctx.status = 500;
    ctx.body = error(String(err));
  }
});

router.post('/stop', async (ctx) => {
  const { token } = ctx.request.body as { token?: string };
  if (!token) {
    ctx.status = 400;
    ctx.body = error('token is required');
    return;
  }
  try {
    await browserManager.stop(token);
    ctx.body = success();
  } catch (err) {
    ctx.status = 404;
    ctx.body = error(String(err));
  }
});

router.get('/list', async (ctx) => {
  const browsers = browserManager.list();
  ctx.body = success({ browsers });
});

export default router;
