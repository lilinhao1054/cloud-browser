#!/bin/bash

# 串行部署 browser-manager-server, cloud-browser-server, cloud-browser-sdk

set -e

SCRIPT_DIR=$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")
ROOT_DIR=$(dirname "$SCRIPT_DIR")

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== 云浏览器全量部署 ===${NC}"
echo "部署时间: $(date)"
echo "根目录: $ROOT_DIR"
echo ""

# 加载环境变量
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}环境变量文件不存在: $ENV_FILE${NC}"
    echo "请复制 .env-template 为 .env 并修改配置"
    exit 1
fi
set -a
source "$ENV_FILE"
set +a

# 要部署的项目（按依赖顺序：manager -> server -> sdk）
PROJECTS=("browser-manager-server" "cloud-browser-server" "cloud-browser-sdk")

echo "开始串行部署..."
echo ""

# 串行部署各项目
for project in "${PROJECTS[@]}"; do
    start_script="$ROOT_DIR/$project/deploy/start.sh"
    
    if [ ! -f "$start_script" ]; then
        echo -e "${RED}[$project]${NC} 启动脚本不存在: $start_script"
        exit 1
    fi
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}[$project]${NC} 开始部署..."
    echo -e "${BLUE}========================================${NC}"
    
    # 部署失败立即退出
    cd "$ROOT_DIR/$project" && bash deploy/start.sh
    echo -e "${GREEN}[$project]${NC} 部署成功 ✓"
done

echo ""
echo "=========================================="
echo -e "${GREEN}全部部署成功!${NC}"
echo ""
pm2 status
pm2 save

echo ""
echo "部署完成时间: $(date)"
