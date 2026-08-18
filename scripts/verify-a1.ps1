# A1 安全基线验收脚本
$ErrorActionPreference = "Continue"
$Base = "http://localhost"
$Api = "$Base/api"
$Pass = 0
$Fail = 0

function Assert-Test($name, $cond, $detail = "") {
  if ($cond) {
    Write-Host "[PASS] $name" -ForegroundColor Green
    if ($detail) { Write-Host "       $detail" }
    $script:Pass++
  } else {
    Write-Host "[FAIL] $name" -ForegroundColor Red
    if ($detail) { Write-Host "       $detail" }
    $script:Fail++
  }
}

Write-Host "`n=== A1 验收测试 ===`n" -ForegroundColor Cyan

# 1. 未登录访问 /uploads/ 应 404
$code1 = curl.exe -s -o NUL -w "%{http_code}" "$Base/uploads/test.pdf"
Assert-Test "未登录 /uploads/xxx.pdf 返回 404" ($code1 -eq "404") "HTTP $code1"

# 2. 未登录 /api/files/ 应 401
$resp2 = curl.exe -s -w "`nHTTP:%{http_code}" "$Api/files/dummy.pdf"
$code2 = ($resp2 -split "HTTP:")[-1].Trim()
$body2 = ($resp2 -split "`nHTTP:")[0]
Assert-Test "未登录 /api/files/ 返回 401" ($code2 -eq "401") "HTTP $code2 body=$body2"

# 3. 伪造 feishuEmployeeId 绑定应失败（Zod 校验 400）
$bindBody = '{"email":"admin@example.com","password":"admin123","feishuEmployeeId":"fake-id"}'
$bindResp = curl.exe -s -w "`nHTTP:%{http_code}" -X POST "$Api/auth/bind-feishu" -H "Content-Type: application/json" -d $bindBody
$bindCode = ($bindResp -split "HTTP:")[-1].Trim()
Assert-Test "伪造 feishuEmployeeId 绑定失败" ($bindCode -eq "400") "HTTP $bindCode"

# 4. 登录获取 token
$loginAdmin = curl.exe -s -X POST "$Api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"admin123"}' | ConvertFrom-Json
$loginMember = curl.exe -s -X POST "$Api/auth/login" -H "Content-Type: application/json" -d '{"email":"member@example.com","password":"member123"}' | ConvertFrom-Json
Assert-Test "admin 登录成功" ($loginAdmin.success -eq $true) ""
Assert-Test "member 登录成功" ($loginMember.success -eq $true) ""

$adminToken = $loginAdmin.token
$memberToken = $loginMember.token

# 5. 降权/改角色后旧 JWT 失效
$oldMemberToken = $memberToken
docker compose exec -T postgres psql -U postgres -d recruitment_system -c 'UPDATE "user" SET role=''admin'' WHERE email=''member@example.com'';' 2>$null | Out-Null
$meResp = curl.exe -s -w "`nHTTP:%{http_code}" "$Api/auth/me" -H "Authorization: Bearer $oldMemberToken"
$meCode = ($meResp -split "HTTP:")[-1].Trim()
docker compose exec -T postgres psql -U postgres -d recruitment_system -c 'UPDATE "user" SET role=''member'' WHERE email=''member@example.com'';' 2>$null | Out-Null
Assert-Test "角色变更后旧 JWT 返回 401" ($meCode -eq "401") "HTTP $meCode"

# 6. admin 上传文件，member 无权下载
$pdfPath = Join-Path $env:TEMP "a1-test.pdf"
$pdfContent = "%PDF-1.4`n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj`n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj`nxref`n0 3`ntrailer<</Size 3/Root 1 0 R>>`nstartxref`n9`n%%EOF"
[System.IO.File]::WriteAllText($pdfPath, $pdfContent)

$uploadResp = curl.exe -s -X POST "$Api/upload" -H "Authorization: Bearer $adminToken" -F "file=@$pdfPath;type=application/pdf" | ConvertFrom-Json
$filename = $uploadResp.data.filename
Assert-Test "admin 上传成功" ($uploadResp.success -eq $true -and $filename) "filename=$filename"

if ($filename) {
  $dlAdmin = curl.exe -s -o NUL -w "%{http_code}" "$Api/files/$filename" -H "Authorization: Bearer $adminToken"
  Assert-Test "admin 可下载自己上传的文件" ($dlAdmin -eq "200") "HTTP $dlAdmin"

  $dlMember = curl.exe -s -w "`nHTTP:%{http_code}" "$Api/files/$filename" -H "Authorization: Bearer $memberToken"
  $memberCode = ($dlMember -split "HTTP:")[-1].Trim()
  Assert-Test "member 无法下载 admin 上传的文件" ($memberCode -eq "403") "HTTP $memberCode"

  # 清理
  curl.exe -s -X DELETE "$Api/upload/$filename" -H "Authorization: Bearer $adminToken" | Out-Null
}

# 7. health
$health = curl.exe -s "$Api/health" | ConvertFrom-Json
Assert-Test "服务健康检查" ($health.success -eq $true) ""

Write-Host "`n=== 结果: $Pass 通过, $Fail 失败 ===`n" -ForegroundColor Cyan
if ($Fail -gt 0) { exit 1 }
