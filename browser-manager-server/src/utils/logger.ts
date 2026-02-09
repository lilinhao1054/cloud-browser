import winston from 'winston';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}] ${message}`;
  })
);

const transports: winston.transport[] = isProduction
  ? [
      // 生产环境同时输出到控制台和文件，方便 docker logs 查看
      new winston.transports.Console(),
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'error.log'),
        level: 'error',
      }),
      new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'combined.log'),
      }),
    ]
  : [new winston.transports.Console()];

const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports,
});

export default logger;
