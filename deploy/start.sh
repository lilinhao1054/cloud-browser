#!/bin/bash

# Docker Compose 部署脚本

set -e

SCRIPT_DIR=$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")
cd "$SCRIPT_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== 云浏览器 Docker Compose 部署 ===${NC}"
echo "部署时间: $(date)"
echo ""

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}错误: Docker Compose 未安装${NC}"
    exit 1
fi

# 检查环境变量文件
if [ -f ".env" ]; then
    echo "使用已有环境变量文件: .env"
else
    if [ -f ".env.template" ]; then
        echo "从模板创建环境变量文件: .env.template -> .env"
        cp ".env.template" .env
    else
        echo -e "${RED}警告: .env 和 .env.template 都不存在，使用默认配置${NC}"
    fi
fi

# 创建日志目录并设置权限（确保容器内用户可写）
echo ""
echo -e "${BLUE}创建日志目录...${NC}"
mkdir -p logs/browser-manager logs/cloud-browser-server
# 设置宽松权限，让容器内的非 root 用户可以写入
chmod -R 777 logs/

# 构建并启动服务
echo ""
echo -e "${BLUE}构建 Docker 镜像...${NC}"
docker-compose build

echo ""
echo -e "${BLUE}启动服务...${NC}"
docker-compose up -d

echo ""
echo -e "${GREEN}=== 部署完成 ===${NC}"
echo ""
echo "服务状态:"
docker-compose ps

echo ""
echo "访问地址:"
echo "  - SDK Demo: http://localhost:3000"
echo "  - Browser Server: http://localhost:4000"
echo "  - Browser Manager: http://localhost:5000"
echo ""
echo "常用命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
