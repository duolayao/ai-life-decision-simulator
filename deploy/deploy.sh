#!/bin/bash
# AI 人生决策模拟器 - Ubuntu 一键部署脚本
#
# 用法（在腾讯云 Ubuntu 服务器上以 root 或 sudo 用户执行）：
#   chmod +x deploy.sh
#   sudo ./deploy.sh
#
# 前置条件：
#   1. 已通过 scp 或 git 将 dist/ 目录和本脚本上传到服务器
#   2. 已编辑 deploy/nginx.conf 替换三个占位符：
#      - <YOUR_DEEPSEEK_API_KEY>
#      - <YOUR_SERVER_PUBLIC_IP>
#      - <YOUR_DEPLOY_PATH>（如无需改可保持默认 /var/www/ai-life-decision-simulator）
#
# 完成后访问：http://<服务器公网IP>/

set -e

# 配置
DEPLOY_DIR="/var/www/ai-life-decision-simulator"
NGINX_CONF_SRC="$(dirname "$0")/nginx.conf"
NGINX_CONF_DEST="/etc/nginx/sites-available/ai-life-decision-simulator"
DIST_SRC="$(dirname "$0")/dist"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== AI 人生决策模拟器 部署脚本 ===${NC}"

# 1. 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请用 root 或 sudo 执行本脚本${NC}"
    exit 1
fi

# 2. 检查 nginx.conf 占位符
echo -e "${YELLOW}[1/8] 检查 nginx.conf 占位符...${NC}"
if grep -q "<YOUR_DEEPSEEK_API_KEY>" "$NGINX_CONF_SRC"; then
    echo -e "${RED}  ✗ nginx.conf 里的 <YOUR_DEEPSEEK_API_KEY> 未替换，请先编辑文件填入真实 Key${NC}"
    exit 1
fi
if grep -q "<YOUR_SERVER_PUBLIC_IP>" "$NGINX_CONF_SRC"; then
    echo -e "${RED}  ✗ nginx.conf 里的 <YOUR_SERVER_PUBLIC_IP> 未替换，请先编辑文件填入服务器公网 IP${NC}"
    exit 1
fi
if grep -q "<YOUR_DEPLOY_PATH>" "$NGINX_CONF_SRC"; then
    echo -e "${RED}  ✗ nginx.conf 里的 <YOUR_DEPLOY_PATH> 未替换，请先编辑文件填入部署路径（或替换为 $DEPLOY_DIR）${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ 占位符检查通过${NC}"

# 3. 安装 Nginx
echo -e "${YELLOW}[2/8] 安装 Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    apt-get update -qq
    apt-get install -y -qq nginx
    echo -e "${GREEN}  ✓ Nginx 安装完成${NC}"
else
    echo -e "${GREEN}  ✓ Nginx 已安装${NC}"
fi

# 4. 创建部署目录
echo -e "${YELLOW}[3/8] 创建部署目录 $DEPLOY_DIR ...${NC}"
mkdir -p "$DEPLOY_DIR"
echo -e "${GREEN}  ✓ 目录就绪${NC}"

# 5. 复制 dist 产物
echo -e "${YELLOW}[4/8] 复制 dist 产物...${NC}"
if [ ! -d "$DIST_SRC" ]; then
    echo -e "${RED}  ✗ 找不到 $DIST_SRC，请先在本地 npm run build 并上传 dist 目录${NC}"
    exit 1
fi
cp -rf "$DIST_SRC"/* "$DEPLOY_DIR/"
chown -R www-data:www-data "$DEPLOY_DIR"
chmod -R 755 "$DEPLOY_DIR"
echo -e "${GREEN}  ✓ 产物已部署到 $DEPLOY_DIR${NC}"

# 6. 安装 Nginx 配置
echo -e "${YELLOW}[5/8] 安装 Nginx 配置...${NC}"
# 移除默认 default 站点（占用 80 端口）
rm -f /etc/nginx/sites-enabled/default
cp -f "$NGINX_CONF_SRC" "$NGINX_CONF_DEST"
ln -sf "$NGINX_CONF_DEST" /etc/nginx/sites-enabled/
echo -e "${GREEN}  ✓ Nginx 配置已安装${NC}"

# 7. 测试 Nginx 配置
echo -e "${YELLOW}[6/8] 测试 Nginx 配置...${NC}"
if nginx -t; then
    echo -e "${GREEN}  ✓ 配置语法正确${NC}"
else
    echo -e "${RED}  ✗ Nginx 配置语法错误，请检查 $NGINX_CONF_DEST${NC}"
    exit 1
fi

# 8. 防火墙放行 80 端口
echo -e "${YELLOW}[7/8] 防火墙放行 80 端口...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp
    ufw --force enable
    echo -e "${GREEN}  ✓ ufw 已放行 80 端口${NC}"
else
    echo -e "${YELLOW}  ! ufw 未安装，跳过${NC}"
fi

# 9. 重启 Nginx
echo -e "${YELLOW}[8/8] 重启 Nginx...${NC}"
systemctl restart nginx
systemctl enable nginx
echo -e "${GREEN}  ✓ Nginx 已重启${NC}"

# 获取服务器公网 IP
PUBLIC_IP=$(curl -s http://metadata.tencentyun.com/latest/meta-data/public-ipv-4 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "访问地址: ${GREEN}http://$PUBLIC_IP/${NC}"
echo ""
echo -e "${YELLOW}常用命令：${NC}"
echo -e "  查看 Nginx 状态:   systemctl status nginx"
echo -e "  重启 Nginx:       sudo systemctl restart nginx"
echo -e "  查看 API 日志:    tail -f /var/log/nginx/deepseek-api.log"
echo -e "  重新部署产物:     sudo cp -rf dist/* $DEPLOY_DIR/ && sudo systemctl reload nginx"
echo ""
echo -e "${YELLOW}腾讯云安全组：${NC}"
echo -e "  请确认腾讯云控制台 → 实例 → 安全组规则中已放行 TCP 80 端口入站"
