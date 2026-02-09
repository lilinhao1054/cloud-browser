import puppeteer, { Browser } from 'puppeteer';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';

export interface BrowserInfo {
  token: string;
  browser: Browser;
  createdAt: Date;
}

const MAX_BROWSERS = Number(process.env.MAX_BROWSERS) || 10; // 最大浏览器实例数
const BROWSER_TIMEOUT = Number(process.env.BROWSER_TIMEOUT) || 30 * 60 * 1000; // 30分钟超时自动清理

export class BrowserManager {
  private browserMap = new Map<string, BrowserInfo>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // 启动定时清理
    this.startCleanupTimer();
    // 监听进程退出，清理所有浏览器
    const handleExit = async () => {
      await this.cleanup();
      process.exit(0);
    };
    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, 60 * 1000); // 每分钟检查一次
  }

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();
    for (const [token, info] of this.browserMap) {
      if (now - info.createdAt.getTime() > BROWSER_TIMEOUT) {
        logger.info(`Cleaning up expired browser: ${token}`);
        await this.stop(token).catch((err) => {
          logger.error(`Failed to cleanup browser ${token}: ${err}`);
        });
      }
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up all browsers...');
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    const tokens = Array.from(this.browserMap.keys());
    await Promise.all(
      tokens.map((token) =>
        this.stop(token).catch((err) => {
          logger.error(`Failed to stop browser ${token}: ${err}`);
        })
      )
    );
  }

  async start(): Promise<{ token: string; browser: Browser }> {
    // 检查实例数限制
    if (this.browserMap.size >= MAX_BROWSERS) {
      throw new Error(`Max browser limit (${MAX_BROWSERS}) reached`);
    }

    const token = randomUUID();
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--remote-allow-origins=*',
        '--disable-gpu',
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage', // 防止共享内存不足
        '--disable-setuid-sandbox',
        // 注意：不使用 --single-process，该参数在 Docker 中不稳定，容易导致崩溃
        '--no-zygote',
        '--ignore-certificate-errors', // 忽略证书错误
        '--ignore-certificate-errors-spki-list',
        '--allow-running-insecure-content',
        // 额外的稳定性参数
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        // 限制渲染进程内存，防止单个页面吃掉所有内存
        '--renderer-process-limit=2',
      ],
    });

    // 监听浏览器断开事件
    browser.on('disconnected', () => {
      logger.warn(`Browser ${token} disconnected unexpectedly`);
      this.browserMap.delete(token);
    });

    this.browserMap.set(token, {
      token,
      browser,
      createdAt: new Date(),
    });

    logger.info(`Browser started: ${token}, total: ${this.browserMap.size}`);
    return { token, browser };
  }

  async stop(token: string): Promise<void> {
    const info = this.browserMap.get(token);
    if (!info) {
      throw new Error('Browser not found');
    }
    try {
      // 设置超时，防止 close() 卡住
      const closePromise = info.browser.close();
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Browser close timeout')), 5000)
      );
      await Promise.race([closePromise, timeoutPromise]);
    } catch (err) {
      logger.error(`Error closing browser ${token}: ${err}`);
      // 强制杀掉浏览器进程
      try {
        const browserProcess = info.browser.process();
        if (browserProcess) {
          browserProcess.kill('SIGKILL');
        }
      } catch (killErr) {
        logger.error(`Error killing browser process ${token}: ${killErr}`);
      }
    } finally {
      this.browserMap.delete(token);
      logger.info(`Browser stopped: ${token}, total: ${this.browserMap.size}`);
    }
  }

  get(token: string): Browser | undefined {
    return this.browserMap.get(token)?.browser;
  }

  list(): string[] {
    return Array.from(this.browserMap.keys());
  }

  getWsEndpoint(token: string): string | undefined {
    const info = this.browserMap.get(token);
    return info?.browser.wsEndpoint();
  }

  getCount(): number {
    return this.browserMap.size;
  }
}

export const browserManager = new BrowserManager();
