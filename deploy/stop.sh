#!/bin/bash

# 一次性停止所有服务

set -e

SCRIPT_DIR=$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")
ROOT_DIR=$(dirname "$SCRIPT_DIR")

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== 停止所有云浏览器服务 ===${NC}"
echo ""

PROJECTS=("browser-manager-server" "cloud-browser-sdk" "cloud-browser-server")

for project in "${PROJECTS[@]}"; do
    stop_script="$ROOT_DIR/$project/deploy/stop.sh"
    if [ -f "$stop_script" ]; then
        echo -e "${BLUE}[$project]${NC} 停止服务..."
        bash "$stop_script"
        echo -e "${GREEN}[$project]${NC} 已停止 ✓"
    else
        echo -e "${RED}[$project]${NC} 停止脚本不存在"
    fi
done

echo ""
echo "=========================================="
echo -e "${GREEN}所有服务已停止${NC}"
pm2 status
