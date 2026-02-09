import Router from 'koa-router';
import { success } from '../types/response';

const router = new Router();

router.get('/', async (ctx) => {
  ctx.body = success({ message: 'Hello from Browser Manager Server!' });
});


export default router;
