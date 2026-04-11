#!/bin/bash

# 招聘管理系统部署脚本
# Recruitment System Deployment Script

set -e

echo "🚀 Starting deployment..."

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
    echo "⚠️  .env file not found! Copying from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your production configuration before continuing."
    exit 1
fi

# 加载环境变量
export $(grep -v '^#' .env | xargs)

echo "📦 Building client application..."
docker-compose --profile build run --rm client-build

echo "🐳 Starting Docker services..."
docker-compose up -d

echo "⏳ Waiting for database to be ready..."
sleep 10

echo "🔄 Running database migrations..."
docker-compose exec -T server npx prisma migrate deploy || true

echo "✅ Deployment completed!"
echo ""
echo "📱 Application is available at:"
echo "   - Frontend: http://localhost:${NGINX_PORT:-80}"
echo "   - API: http://localhost:${NGINX_PORT:-80}/api"
echo ""
echo "📊 To view logs: docker-compose logs -f"
echo "🛑 To stop: docker-compose down"
