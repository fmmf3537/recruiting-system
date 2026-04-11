# 招聘管理系统部署脚本 (PowerShell)
# Recruitment System Deployment Script for Windows

$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting deployment..." -ForegroundColor Green

# 检查 .env 文件是否存在
if (-not (Test-Path .env)) {
    Write-Host "⚠️  .env file not found! Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "⚠️  Please edit .env file with your production configuration before continuing." -ForegroundColor Yellow
    exit 1
}

# 加载环境变量
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^#][^=]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}

Write-Host "📦 Building client application..." -ForegroundColor Cyan
docker-compose --profile build run --rm client-build

Write-Host "🐳 Starting Docker services..." -ForegroundColor Cyan
docker-compose up -d

Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "🔄 Running database migrations..." -ForegroundColor Cyan
docker-compose exec -T server npx prisma migrate deploy

Write-Host "✅ Deployment completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📱 Application is available at:" -ForegroundColor Cyan
$port = if ($env:NGINX_PORT) { $env:NGINX_PORT } else { "80" }
Write-Host "   - Frontend: http://localhost:$port"
Write-Host "   - API: http://localhost:$port/api"
Write-Host ""
Write-Host "📊 To view logs: docker-compose logs -f" -ForegroundColor Gray
Write-Host "🛑 To stop: docker-compose down" -ForegroundColor Gray
