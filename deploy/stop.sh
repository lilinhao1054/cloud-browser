#!/bin/bash

# Docker Compose 停止脚本

set -e

SCRIPT_DIR=$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")
cd "$SCRIPT_DIR"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== 停止云浏览器 Docker 服务 ===${NC}"
echo ""

# 停止并移除容器
docker-compose down

echo ""
echo -e "${GREEN}所有服务已停止${NC}"

# 可选：清理镜像和卷
if [ "$1" == "--clean" ]; then
    echo ""
    echo -e "${BLUE}清理镜像和卷...${NC}"
    docker-compose down -v --rmi local
    echo -e "${GREEN}清理完成${NC}"
fi
