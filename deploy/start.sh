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

# 环境变量配置
export_browser_manager_server_env() {
    export HOST=127.0.0.1
    export PORT=5000
}

export_cloud_browser_server_env() {
    export HOST=0.0.0.0
    export PORT=4000
    export BROWSER_ENDPOINT_HOST=127.0.0.1
    export BROWSER_ENDPOINT_PORT=5000
}

export_cloud_browser_sdk_env() {
    export HOST=0.0.0.0
    export PORT=3000
    export VITE_SDK_SERVER_URL=http://127.0.0.1:4000
    export VITE_API_BASE_URL=http://127.0.0.1:4000
}

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
    
    # 根据项目名注入对应环境变量
    case "$project" in
        "browser-manager-server")
            export_browser_manager_server_env
            ;;
        "cloud-browser-server")
            export_cloud_browser_server_env
            ;;
        "cloud-browser-sdk")
            export_cloud_browser_sdk_env
            ;;
    esac
    
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
