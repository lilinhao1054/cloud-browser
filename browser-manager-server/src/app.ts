import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import healthRouter from './routes/health';
import browserRouter from './routes/browser';
import logger from './utils/logger';

const app = new Koa();

// 中间件：请求日志
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.info(`${ctx.method} ${ctx.url} - ${ms}ms`);
});

// 解析请求体
app.use(bodyParser());

// 注册路由
app.use(healthRouter.routes());
app.use(healthRouter.allowedMethods());
app.use(browserRouter.routes());
app.use(browserRouter.allowedMethods());

export default app;
