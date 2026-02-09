import winston from 'winston';
import path from 'path';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// 日志格式
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// 根据环境配置
const isProduction = process.env.NODE_ENV === 'production';

// 创建 logger
const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: isProduction
    ? [
        // 生产环境：同时输出到控制台和文件，方便 docker logs 查看
        new winston.transports.Console(),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: path.join(process.cwd(), 'logs', 'combined.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ]
    : [
        // 开发环境：控制台输出
        new winston.transports.Console({
          format: combine(
            colorize({ all: true }),
            timestamp({ format: 'HH:mm:ss' }),
            logFormat
          ),
        }),
      ],
});

export { logger };
