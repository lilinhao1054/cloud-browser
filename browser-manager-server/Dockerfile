FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包含 devDependencies 用于构建）
RUN npm ci

# 复制源码
COPY . .

# 构建
RUN npm run build

# 生产阶段
FROM node:20-alpine

# 安装 Chromium 和依赖
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-cjk

# 设置 Puppeteer 环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 只安装生产依赖
RUN npm ci --omit=dev

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist

# 创建日志目录
RUN mkdir -p logs

# 添加非 root 用户运行
RUN addgroup -S pptruser && adduser -S pptruser -G pptruser \
    && chown -R pptruser:pptruser /app \
    && chown -R pptruser:pptruser /app/logs

USER pptruser

EXPOSE 5000

CMD ["node", "dist/index.js"]
