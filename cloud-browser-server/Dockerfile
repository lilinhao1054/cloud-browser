FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package.json
COPY package.json ./

# 安装所有依赖（包含 devDependencies 用于构建）
RUN npm install

# 复制源码
COPY . .

# 构建
RUN npm run build

# 生产阶段
FROM node:20-alpine

WORKDIR /app

# 复制 package.json
COPY package.json ./

# 只安装生产依赖
RUN npm install --omit=dev

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist

# 创建日志目录
RUN mkdir -p logs

EXPOSE 4000

CMD ["node", "dist/index.js"]
