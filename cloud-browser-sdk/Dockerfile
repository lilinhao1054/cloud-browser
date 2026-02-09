FROM node:20-alpine AS builder

WORKDIR /app

# 构建参数
ARG VITE_SDK_SERVER_URL=http://localhost:4000
ARG VITE_API_BASE_URL=http://localhost:4000

# 设置环境变量供 Vite 构建使用
ENV VITE_SDK_SERVER_URL=${VITE_SDK_SERVER_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies，用于构建）
RUN npm ci

# 复制源码
COPY . .

# 构建
RUN npm run build

# 生产阶段 - 使用 nginx 托管静态文件
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist-demo /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
