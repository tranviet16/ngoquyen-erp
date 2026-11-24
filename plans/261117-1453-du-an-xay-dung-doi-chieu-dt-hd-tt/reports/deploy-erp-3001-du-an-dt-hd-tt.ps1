<#
.SYNOPSIS
  Deploy bản "Đối chiếu DT-HĐ-TT" lên production — mục 1 của production-runbook.md.

.DESCRIPTION
  Chạy TRÊN admin-pc, trong một cửa sổ PowerShell (Windows PowerShell 5.1 hoặc 7), không cần quyền admin:

      powershell -ExecutionPolicy Bypass -File .\deploy-erp-3001-du-an-dt-hd-tt.ps1

  Các bước (dừng ngay ở bước đầu tiên bị lỗi):
    1. Kiểm trước, app vẫn chạy: Docker, container app và Postgres, commit cần deploy, chỉ đúng một
       migration chờ (20261117160000_du_an_dt_hd_tt). Còn migration khác chờ → dừng, không đụng gì.
    2. Build sẵn image mới từ một worktree sạch (ngoài OneDrive) của commit cần deploy. App vẫn chạy.
    3. Hỏi xác nhận (gõ DEPLOY). Từ đây mới dừng app.
    4. Dừng app → sao lưu DB (pg_dump) → ghi số liệu nền → migrate → so số liệu nền (phải giống hệt).
    5. Chạy build mới → kiểm /api/health. Không lên thì tự quay về image cũ.

  Bí mật: DATABASE_URL, BETTER_AUTH_SECRET và các biến khác lấy từ chính container đang chạy (cùng giá
  trị với bản hiện tại), giữ trong biến môi trường của tiến trình này, không in ra, xóa khi xong.
  Nhật ký và bản sao lưu: %LOCALAPPDATA%\NgoQuyenERP\backups\erp\du-an-dt-hd-tt-<giờ>.

  Script KHÔNG import file và không sửa dữ liệu: bước 2–4 của runbook (Cài đặt, NCC, import qua màn
  duyệt) vẫn làm tay sau khi deploy.

.PARAMETER Repo
  Thư mục repo trên admin-pc (có remote origin trỏ tới GitHub).
.PARAMETER Ref
  Commit / nhánh cần deploy (mặc định origin/main).
.PARAMETER Yes
  Bỏ câu hỏi xác nhận trước khi dừng app.
#>
[CmdletBinding()]
param(
  [string]$Repo = "C:\Users\tranv\OneDrive\Desktop\ngoquyen-erp",
  [string]$Ref = "origin/main",
  [string]$ExpectedMigration = "20261117160000_du_an_dt_hd_tt",
  [string]$App = "ngoquyen-erp-3001",
  [string]$Pg = "docker-postgres-1",
  [string]$Database = "ngoquyyen_erp",
  [string]$DbUser = "nqerp",
  [string]$HealthUrl = "http://127.0.0.1:3001/api/health",
  [switch]$Yes
)

$ErrorActionPreference = "Continue"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$bk = Join-Path $env:LOCALAPPDATA "NgoQuyenERP\backups\erp\du-an-dt-hd-tt-$stamp"
New-Item -ItemType Directory -Force $bk | Out-Null
Start-Transcript -Path (Join-Path $bk "deploy-log.txt") | Out-Null

$secretVars = @("DATABASE_URL", "POSTGRES_PASSWORD", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL", "TRUSTED_ORIGINS", "SENTRY_DSN")
$state = @{ stopped = $false; rollbackTag = $null; imgName = $null; compose = $null; proj = $null }

function Step([string]$msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }
function Ok([string]$msg) { Write-Host "   OK  $msg" -ForegroundColor Green }
function Fail([string]$msg) { throw $msg }
function Assert-Exit([string]$what) { if ($LASTEXITCODE -ne 0) { Fail "$what (mã thoát $LASTEXITCODE)" } }

# Chạy lệnh native qua cmd để gộp stdout/stderr thành văn bản thường (PowerShell 5.1 bọc stderr thành lỗi).
function Invoke-Cmd([string]$line) {
  $out = cmd /c "$line 2>&1" | Out-String
  return @{ code = $LASTEXITCODE; out = $out }
}

function Test-Health {
  for ($i = 1; $i -le 40; $i++) {
    try {
      $h = Invoke-RestMethod $HealthUrl -TimeoutSec 5
      if ($h.status -eq "ok" -and $h.db -eq "ok") { return $true }
    } catch { }
    Start-Sleep -Seconds 3
  }
  return $false
}

# Số liệu nền: sổ công nợ, giao dịch dự án, dự toán. Cột liệt kê rõ để migration thêm cột không làm đổi md5.
$baselineSql = @'
select 'ledger_transactions', count(*), md5(coalesce(string_agg(l::text, '|' order by l.id), '')) from ledger_transactions l;
select 'project_transactions', count(*), md5(coalesce(string_agg(concat_ws(',', id, "projectId", date, "itemName", qty, "amountHd", "amountTt", "deletedAt"), '|' order by id), '')) from project_transactions;
select 'project_estimates', count(*), md5(coalesce(string_agg(concat_ws(',', id, "projectId", "itemName", qty, "totalVnd", "deletedAt"), '|' order by id), '')) from project_estimates;
'@

function Save-Baseline([string]$name) {
  docker exec $Pg sh -c "psql -U $DbUser -d $Database -v ON_ERROR_STOP=1 -At -f /tmp/deploy-$stamp/baseline.sql > /tmp/deploy-$stamp/$name 2>&1"
  $code = $LASTEXITCODE
  docker cp "${Pg}:/tmp/deploy-$stamp/$name" (Join-Path $bk $name) | Out-Null
  if ($code -ne 0) { Fail "psql số liệu nền lỗi — đọc $bk\$name" }
  return (Get-Content (Join-Path $bk $name) -Encoding UTF8)
}

$exitCode = 0
try {
  # ---------------------------------------------------------------- 1. Kiểm trước (app vẫn chạy)
  Step "1. Kiểm trước — app vẫn chạy, chưa đổi gì"
  foreach ($tool in "docker", "git", "node", "npm") {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "Máy chưa có lệnh '$tool'" }
  }
  docker info --format "{{.ServerVersion}}" | Out-Null; Assert-Exit "Docker chưa chạy"
  docker compose version | Out-Null; Assert-Exit "Không có docker compose"

  $running = docker inspect -f "{{.State.Running}}" $App
  if ($LASTEXITCODE -ne 0 -or "$running".Trim() -ne "true") { Fail "Container $App không chạy — dừng (đây có đúng là admin-pc?)" }
  $pgRunning = docker inspect -f "{{.State.Running}}" $Pg
  if ($LASTEXITCODE -ne 0 -or "$pgRunning".Trim() -ne "true") { Fail "Container $Pg không chạy" }

  $labelsJson = docker inspect -f "{{json .Config.Labels}}" $App | Out-String
  $labels = ConvertFrom-Json $labelsJson
  $proj = $labels.'com.docker.compose.project'
  $img = (docker inspect -f "{{.Config.Image}}" $App | Out-String).Trim()
  $imgName = $img -replace ':[^:/]+$', ''
  $oldImageId = (docker inspect -f "{{.Image}}" $App | Out-String).Trim()
  if (-not $proj) { Fail "Container $App không do docker compose tạo — không biết tên project" }
  if ($imgName -ne "$proj-erp-3001") { Fail "Image '$img' không khớp project compose '$proj' — deploy tay theo runbook" }
  $state.imgName = $imgName; $state.proj = $proj
  Ok "app $App, project compose '$proj', image $img"

  # Bí mật và cấu hình: lấy từ container đang chạy, không in.
  $envJson = docker inspect -f "{{json .Config.Env}}" $App | Out-String
  $envMap = @{}
  foreach ($e in (ConvertFrom-Json $envJson)) { $i = $e.IndexOf("="); if ($i -gt 0) { $envMap[$e.Substring(0, $i)] = $e.Substring($i + 1) } }
  foreach ($k in "DATABASE_URL", "BETTER_AUTH_SECRET") { if (-not $envMap[$k]) { Fail "Container thiếu biến $k" } }
  $appDbUrl = $envMap["DATABASE_URL"]
  $urlPattern = '^postgresql://[^:/@]+:(.+)@postgres:5432/' + [regex]::Escape($Database) + '(\?|$)'
  if ($appDbUrl -notmatch $urlPattern) {
    Fail "DATABASE_URL của container không có dạng postgresql://user:***@postgres:5432/$Database — deploy tay theo runbook"
  }
  $env:POSTGRES_PASSWORD = $Matches[1]
  foreach ($k in "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_BETTER_AUTH_URL", "TRUSTED_ORIGINS", "SENTRY_DSN") {
    if ($envMap.ContainsKey($k)) { Set-Item -Path "Env:$k" -Value $envMap[$k] }
  }
  $portLine = (docker port $Pg 5432 | Select-Object -First 1)
  if ("$portLine" -notmatch ':(\d+)\s*$') { Fail "Postgres $Pg không mở cổng ra máy" }
  $hostDbUrl = $appDbUrl -replace '@postgres:5432/', "@127.0.0.1:$($Matches[1])/"
  Ok "đã đọc cấu hình từ container (không in giá trị); Postgres trên máy: cổng $($Matches[1])"

  # Commit cần deploy.
  git -C $Repo fetch origin; Assert-Exit "git fetch"
  $sha = (git -C $Repo rev-parse --verify "$Ref" | Out-String).Trim(); Assert-Exit "Không thấy $Ref"
  git -C $Repo cat-file -e "${sha}:prisma/migrations/$ExpectedMigration/migration.sql"
  Assert-Exit "Commit $sha không có migration $ExpectedMigration"
  $short = $sha.Substring(0, 7)
  Ok "commit deploy $short ($Ref)"

  # Worktree sạch ngoài OneDrive để build, không đụng thư mục làm việc của repo.
  $build = Join-Path $env:LOCALAPPDATA "NgoQuyenERP\deploy\erp-$short"
  if (Test-Path $build) {
    $head = (git -C $build rev-parse HEAD | Out-String).Trim()
    if ($head -ne $sha) { Fail "$build đã có nhưng không ở commit $short — xóa thư mục đó rồi chạy lại" }
  } else {
    New-Item -ItemType Directory -Force (Split-Path $build) | Out-Null
    git -C $Repo worktree add --detach $build $sha; Assert-Exit "git worktree add"
  }
  $compose = Join-Path $build "docker\docker-compose.erp-3001.yml"
  $state.compose = $compose
  Ok "mã nguồn ở $build"

  Push-Location $build
  try {
    Step "npm ci (cài prisma để migrate) — vài phút"
    $r = Invoke-Cmd "npm ci --no-audit --no-fund"
    if ($r.code -ne 0) { Write-Host $r.out; Fail "npm ci lỗi" }
    Ok "npm ci"

    $env:DATABASE_URL = $hostDbUrl
    $r = Invoke-Cmd "npx prisma migrate status"
    Write-Host $r.out
    if ($r.out -match "(?i)failed") { Fail "DB có migration lỗi từ trước — dừng, xử lý tay" }
    $pending = @([regex]::Matches($r.out, '(?m)^\s*(\d{14}_[A-Za-z0-9_]+)\s*$') | ForEach-Object { $_.Groups[1].Value })
    $alreadyApplied = $false
    if ($pending.Count -eq 0 -and $r.out -match "up to date") {
      $alreadyApplied = $true
      Ok "DB đã có sẵn mọi migration (chạy lại script?) — sẽ bỏ qua bước migrate"
    } elseif ($pending.Count -eq 1 -and $pending[0] -eq $ExpectedMigration) {
      Ok "chỉ chờ đúng 1 migration: $ExpectedMigration"
    } else {
      Fail ("Migration chờ không đúng như dự kiến: " + ($pending -join ", ") + ". Nếu có 20261106090000_vat_tu_pair_scope_and_import_review thì go-live công nợ vật tư chưa chạy — dừng, không deploy.")
    }
  } finally { Pop-Location }

  # ---------------------------------------------------------------- 2. Build (app vẫn chạy)
  Step "2. Build image mới — app vẫn chạy (vài phút)"
  $env:DATABASE_URL = $appDbUrl
  docker compose -p $proj -f $compose build; Assert-Exit "docker compose build"
  $rollbackTag = "truoc-du-an-dt-hd-tt-$stamp"
  docker tag $oldImageId "${imgName}:$rollbackTag"; Assert-Exit "docker tag image cũ"
  $state.rollbackTag = $rollbackTag
  Ok "image mới ${imgName}:latest; image cũ giữ ở ${imgName}:$rollbackTag"

  # ---------------------------------------------------------------- 3. Xác nhận
  Step "3. Sẵn sàng chuyển production sang commit $short"
  Write-Host "   App sẽ dừng khoảng 1–3 phút: sao lưu → migrate → chạy bản mới."
  if (-not $Yes) {
    $answer = Read-Host "   Gõ DEPLOY để tiếp tục (gõ khác = dừng, chưa đổi gì)"
    if ($answer -cne "DEPLOY") { Fail "Người chạy dừng ở bước xác nhận — production chưa đổi (chỉ có thêm image build sẵn)" }
  }

  # ---------------------------------------------------------------- 4. Dừng app, sao lưu, migrate
  Step "4. Dừng app → sao lưu → migrate"
  docker stop $App | Out-Null; Assert-Exit "docker stop $App"
  $state.stopped = $true
  Ok "đã dừng $App"

  $dump = "truoc-du-an-dt-hd-tt-$stamp.dump"
  docker exec $Pg pg_dump -U $DbUser -Fc -d $Database -f "/tmp/$dump"; Assert-Exit "pg_dump"
  docker cp "${Pg}:/tmp/$dump" (Join-Path $bk $dump) | Out-Null; Assert-Exit "docker cp bản sao lưu"
  $toc = (docker exec $Pg pg_restore -l "/tmp/$dump" | Measure-Object -Line).Lines
  if ($toc -lt 10) { Fail "Bản sao lưu có vẻ hỏng (pg_restore -l chỉ $toc dòng)" }
  $hash = (Get-FileHash -Algorithm SHA256 (Join-Path $bk $dump)).Hash
  "$dump  SHA256 $hash" | Out-File -Encoding utf8 (Join-Path $bk "backup-hash.txt")
  Ok "sao lưu $bk\$dump ($toc mục, SHA256 $($hash.Substring(0, 12))…); bản trong container: /tmp/$dump"

  docker exec $Pg mkdir -p "/tmp/deploy-$stamp" | Out-Null
  [IO.File]::WriteAllText((Join-Path $bk "baseline.sql"), $baselineSql, (New-Object System.Text.UTF8Encoding $false))
  docker cp (Join-Path $bk "baseline.sql") "${Pg}:/tmp/deploy-$stamp/baseline.sql" | Out-Null; Assert-Exit "docker cp baseline.sql"
  $before = Save-Baseline "baseline-truoc.txt"
  Ok "số liệu nền trước migrate: $bk\baseline-truoc.txt"

  if (-not $alreadyApplied) {
    Push-Location $build
    try {
      $env:DATABASE_URL = $hostDbUrl
      $r = Invoke-Cmd "npx prisma migrate deploy"
      Write-Host $r.out
      if ($r.code -ne 0) {
        Fail "prisma migrate deploy lỗi. Xem kết quả ở trên; khôi phục DB bằng bản sao lưu $dump theo mục 5 runbook nếu migration ghi dở."
      }
      $r = Invoke-Cmd "npx prisma migrate status"
      if ($r.out -notmatch "up to date") { Write-Host $r.out; Fail "Sau migrate, DB chưa 'up to date'" }
      Ok "migrate xong, DB up to date"
    } finally { Pop-Location }
  }

  $after = Save-Baseline "baseline-sau.txt"
  if (Compare-Object $before $after) { Fail "Số liệu nền đổi sau migrate (so $bk\baseline-truoc.txt với baseline-sau.txt) — không chạy bản mới" }
  Ok "số liệu nền giữ nguyên (sổ công nợ, giao dịch dự án, dự toán)"

  # ---------------------------------------------------------------- 5. Chạy bản mới
  Step "5. Chạy bản mới và kiểm /api/health"
  $env:DATABASE_URL = $appDbUrl
  docker compose -p $proj -f $compose up -d --no-build; Assert-Exit "docker compose up"
  if (-not (Test-Health)) {
    docker logs --tail 60 $App
    Fail "Bản mới không lên (health không ok)"
  }
  $state.stopped = $false
  Ok "production chạy commit $short — $HealthUrl ok"

  Write-Host ""
  Write-Host "XONG. Kiểm tay (mục 1.8 runbook):" -ForegroundColor Green
  Write-Host "  - đăng nhập admin;"
  Write-Host "  - Dự án xây dựng → MNTC-GD1 → tab 'Đối chiếu DT-HĐ-TT' mở được (chưa import thì báo cáo trống)."
  Write-Host "Bước tiếp theo làm tay: mục 2 (Cài đặt, NCC) và mục 3 (import qua màn duyệt) của production-runbook.md."
  Write-Host "Nhật ký và sao lưu: $bk"
}
catch {
  $exitCode = 1
  Write-Host ""
  Write-Host "DỪNG: $($_.Exception.Message)" -ForegroundColor Red
  if ($state.stopped -and $state.rollbackTag) {
    # App đã dừng: đưa bản cũ chạy lại (migration chỉ thêm bảng / cột null nên bản cũ vẫn chạy được).
    Write-Host "Quay về bản cũ $($state.imgName):$($state.rollbackTag) …" -ForegroundColor Yellow
    docker tag "$($state.imgName):$($state.rollbackTag)" "$($state.imgName):latest"
    $env:DATABASE_URL = $appDbUrl
    docker compose -p $state.proj -f $state.compose up -d --no-build --force-recreate
    if (Test-Health) { Write-Host "Bản cũ đã chạy lại, health ok." -ForegroundColor Yellow }
    else { Write-Host "Bản cũ CHƯA lên — gọi kỹ thuật, xem mục 5 runbook." -ForegroundColor Red }
  } elseif ($state.stopped) {
    docker start $App | Out-Null
    Write-Host "Đã bật lại container cũ $App." -ForegroundColor Yellow
  }
  Write-Host "Nhật ký: $bk\deploy-log.txt"
}
finally {
  foreach ($k in $secretVars) { Remove-Item -Path "Env:$k" -ErrorAction SilentlyContinue }
  Stop-Transcript | Out-Null
}
exit $exitCode
