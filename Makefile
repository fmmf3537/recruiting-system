# 招聘管理系统部署 Makefile
# Recruitment System Deployment Makefile

.PHONY: help install dev build docker-build docker-up docker-down test clean

# 默认目标
help:
	@echo "招聘管理系统 - 可用命令"
	@echo "======================"
	@echo "make install       - 安装所有依赖"
	@echo "make dev           - 启动开发服务器"
	@echo "make build         - 构建生产版本"
	@echo "make docker-build  - 构建 Docker 镜像"
	@echo "make docker-up     - 启动 Docker 服务"
	@echo "make docker-down   - 停止 Docker 服务"
	@echo "make migrate       - 执行数据库迁移"
	@echo "make test          - 运行测试"
	@echo "make clean         - 清理构建文件"
	@echo "make deploy        - 完整部署"

# 安装依赖
install:
	cd server && pnpm install
	cd ../client && pnpm install

# 开发模式
dev:
	@echo "启动开发服务器..."
	@make -j2 dev-server dev-client

dev-server:
	cd server && pnpm dev

dev-client:
	cd client && pnpm dev

# 构建
build:
	cd client && pnpm build
	cd ../server && pnpm build

# Docker 构建
docker-build:
	cd client && docker build -t ats-client:latest .
	cd ../server && docker build -t ats-server:latest .

# Docker 启动
docker-up:
	docker-compose up -d

# Docker 停止
docker-down:
	docker-compose down

# 数据库迁移
migrate:
	docker-compose exec server npx prisma migrate deploy

# 测试
test:
	cd server && pnpm test

# 清理
clean:
	cd client && rm -rf dist node_modules
	cd ../server && rm -rf dist node_modules
	docker-compose down -v

# 完整部署
deploy:
	./deploy.sh
