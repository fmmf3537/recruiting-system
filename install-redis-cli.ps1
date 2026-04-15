$redisDir = "C:\redis"
$zipPath = "$env:TEMP\Redis-x64-3.0.504.zip"
$downloadUrl = "https://github.com/microsoftarchive/redis/releases/download/win-3.0.504/Redis-x64-3.0.504.zip"

Write-Host "Downloading Redis..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting to $redisDir..."
if (Test-Path $redisDir) {
    Remove-Item -Recurse -Force $redisDir
}
Expand-Archive -Path $zipPath -DestinationPath $redisDir -Force

Write-Host "Adding to PATH..."
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$redisDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$redisDir", "User")
}

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "Testing redis-cli..."
& "$redisDir\redis-cli.exe" --version

Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Write-Host "Done! You can now run: redis-cli -h localhost ping"
