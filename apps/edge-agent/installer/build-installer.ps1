<#
.SYNOPSIS
    Build do instalador SmartPACS Edge Agent (.exe)

.DESCRIPTION
    Prepara todos os componentes e gera o SmartPACSEdgeAgent-Setup.exe via Inno Setup.
    Execute uma vez antes de distribuir o instalador para as clinicas.

    O que este script faz:
    1. Verifica pre-requisitos (Node.js, Inno Setup)
    2. Compila o Edge Agent (npm ci + npm run build)
    3. Baixa NSSM, DCMTK e Node.js portatil (se nao existirem)
    4. Monta a pasta bundle/ com tudo que o installer.iss precisa
    5. Chama iscc.exe para gerar o .exe final

.PARAMETER SkipNodeDownload
    Pula o download do Node.js portatil (use se ja estiver em bundle\node\)

.PARAMETER SkipDcmtkDownload
    Pula o download do DCMTK (use se ja estiver em bundle\tools\dcmtk\)

.PARAMETER SkipNssmDownload
    Pula o download do NSSM (use se ja estiver em bundle\tools\nssm\)

.PARAMETER IsccPath
    Caminho para o compilador Inno Setup (iscc.exe).
    Padrao: detecta automaticamente nas pastas padrao de instalacao.

.PARAMETER OutputDir
    Pasta onde o .exe sera gerado. Padrao: installer\output\

.EXAMPLE
    # Build completo
    .\build-installer.ps1

.EXAMPLE
    # Rebuild rapido (componentes ja baixados)
    .\build-installer.ps1 -SkipNodeDownload -SkipDcmtkDownload -SkipNssmDownload
#>

#Requires -Version 5.1

param(
    [switch] $SkipNodeDownload,
    [switch] $SkipDcmtkDownload,
    [switch] $SkipNssmDownload,
    [string] $IsccPath = "",
    [string] $OutputDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Constantes ──────────────────────────────────────────────────────────────
$APP_VERSION   = "1.0.0"
$NODE_ZIP_URL  = "https://nodejs.org/dist/v22.13.1/node-v22.13.1-win-x64.zip"
$NSSM_ZIP_URL  = "https://nssm.cc/release/nssm-2.24.zip"
$DCMTK_ZIP_URL = "https://dicom.offis.de/download/dcmtk/dcmtk368/bin/dcmtk-3.6.8-win64-dynamic.zip"

$ScriptDir   = Split-Path $MyInvocation.MyCommand.Path -Parent
$AgentRoot   = Split-Path $ScriptDir -Parent
$BundleDir   = Join-Path $ScriptDir "bundle"
$ToolsDir    = Join-Path $BundleDir "tools"
$OutputDirFinal = if ($OutputDir) { $OutputDir } else { Join-Path $ScriptDir "output" }

# ─── Helpers ─────────────────────────────────────────────────────────────────
function Write-Step  ([string]$t) { Write-Host "`n[BUILD] --- $t" -ForegroundColor Cyan }
function Write-OK    ([string]$m) { Write-Host "[BUILD]  OK  $m" -ForegroundColor Green }
function Write-Info  ([string]$m) { Write-Host "[BUILD]      $m" -ForegroundColor DarkGray }
function Write-Fail  ([string]$m) { Write-Host "[BUILD]  ERR $m" -ForegroundColor Red }

function Download-File {
    param([string]$Url, [string]$Dest, [string]$Label)
    Write-Info "Baixando $Label..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
    Write-OK "$Label baixado"
}

function Expand-ToDir {
    param([string]$Zip, [string]$TargetDir)
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    Expand-Archive -Path $Zip -DestinationPath $TargetDir -Force
}

# ─────────────────────────────────────────────────────────────────────────────
# Banner
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  +==========================================================+" -ForegroundColor Cyan
Write-Host "  |  SmartPACS Edge Agent — Build do Instalador v$APP_VERSION      |" -ForegroundColor Cyan
Write-Host "  +==========================================================+" -ForegroundColor Cyan
Write-Host ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. Verificar Node.js (para fazer o build do agente)
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Verificando Node.js (necessario para o build)"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Fail "Node.js nao encontrado. Instale Node.js 22+ de https://nodejs.org"
    exit 1
}
$nodeVer = (& node --version).TrimStart('v')
Write-OK "Node.js $nodeVer"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Build do Edge Agent
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Compilando Edge Agent"

Push-Location $AgentRoot
try {
    Write-Info "npm ci..."
    & npm ci --no-audit --no-fund 2>&1 | ForEach-Object { Write-Info $_ }
    if ($LASTEXITCODE -ne 0) { throw "npm ci falhou" }

    Write-Info "npm run build..."
    & npm run build 2>&1 | ForEach-Object { Write-Info $_ }
    if ($LASTEXITCODE -ne 0) { throw "npm run build falhou" }

    Write-OK "Build concluido"
}
finally {
    Pop-Location
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. Montar pasta bundle/
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Montando pasta bundle/"

# Limpar e recriar bundle
if (Test-Path $BundleDir) {
    Remove-Item "$BundleDir\dist"         -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "$BundleDir\node_modules" -Recurse -Force -ErrorAction SilentlyContinue
}
foreach ($sub in @("dist","node_modules","node","tools\nssm","tools\dcmtk")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $BundleDir $sub) | Out-Null
}

# Copiar artefatos compilados
Write-Info "Copiando dist/..."
Copy-Item "$AgentRoot\dist\*" "$BundleDir\dist" -Recurse -Force

# Copiar node_modules de producao
Write-Info "Instalando dependencias de producao em bundle\node_modules\..."
Push-Location $BundleDir
try {
    Copy-Item "$AgentRoot\package.json"  $BundleDir -Force
    Copy-Item "$AgentRoot\nest-cli.json" $BundleDir -Force
    & npm install --omit=dev --no-audit --no-fund --prefix . 2>&1 | ForEach-Object { Write-Info $_ }
    if ($LASTEXITCODE -ne 0) { throw "npm install --omit=dev falhou em bundle/" }
    # npm install --prefix cria node_modules local, que e o que queremos
}
finally {
    Pop-Location
}
Write-OK "bundle/dist e bundle/node_modules prontos"

# ─────────────────────────────────────────────────────────────────────────────
# 4. NSSM
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Preparando NSSM"
$nssmExe = Join-Path $ToolsDir "nssm\nssm.exe"

if ($SkipNssmDownload -and (Test-Path $nssmExe)) {
    Write-OK "NSSM ja presente (--SkipNssmDownload)"
}
else {
    $nssmZip = Join-Path $env:TEMP "nssm.zip"
    $nssmTmp = Join-Path $env:TEMP "nssm-extract"

    Download-File $NSSM_ZIP_URL $nssmZip "NSSM"
    Expand-ToDir  $nssmZip $nssmTmp

    $exe = Get-ChildItem -Recurse $nssmTmp -Filter "nssm.exe" |
           Where-Object { $_.DirectoryName -like "*win64*" } |
           Select-Object -First 1
    if (-not $exe) {
        $exe = Get-ChildItem -Recurse $nssmTmp -Filter "nssm.exe" | Select-Object -First 1
    }
    Copy-Item $exe.FullName $nssmExe -Force
    Remove-Item $nssmZip, $nssmTmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-OK "NSSM copiado para bundle\tools\nssm\"
}

# ─────────────────────────────────────────────────────────────────────────────
# 5. DCMTK
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Preparando DCMTK"
$dcmtkDir = Join-Path $ToolsDir "dcmtk"

if ($SkipDcmtkDownload -and (Test-Path "$dcmtkDir\storescp.exe")) {
    Write-OK "DCMTK ja presente (--SkipDcmtkDownload)"
}
else {
    $dcmtkZip = Join-Path $env:TEMP "dcmtk.zip"
    $dcmtkTmp = Join-Path $env:TEMP "dcmtk-extract"

    Download-File $DCMTK_ZIP_URL $dcmtkZip "DCMTK"
    Expand-ToDir  $dcmtkZip $dcmtkTmp

    # O zip tem uma pasta versionada — mover tudo para dcmtkDir
    $inner = Get-ChildItem $dcmtkTmp -Directory | Select-Object -First 1
    if ($inner) {
        Copy-Item "$($inner.FullName)\*" $dcmtkDir -Recurse -Force
    }
    else {
        Copy-Item "$dcmtkTmp\*" $dcmtkDir -Recurse -Force
    }
    Remove-Item $dcmtkZip, $dcmtkTmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-OK "DCMTK copiado para bundle\tools\dcmtk\"
}

# Verificar que storescp.exe esta na pasta bin (instalador vai apontar para ela)
$binDir = Join-Path $dcmtkDir "bin"
if (-not (Test-Path "$binDir\storescp.exe")) {
    # Alguns builds colocam na raiz
    $storescp = Get-ChildItem -Recurse $dcmtkDir -Filter "storescp.exe" | Select-Object -First 1
    if ($storescp) {
        $binDir = $storescp.DirectoryName
        Write-Info "storescp.exe encontrado em $binDir"
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 6. Node.js portatil
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Preparando Node.js portatil"
$nodeDir = Join-Path $BundleDir "node"

if ($SkipNodeDownload -and (Test-Path "$nodeDir\node.exe")) {
    Write-OK "Node.js portatil ja presente (--SkipNodeDownload)"
}
else {
    $nodeZip = Join-Path $env:TEMP "node-portable.zip"
    $nodeTmp = Join-Path $env:TEMP "node-extract"

    Download-File $NODE_ZIP_URL $nodeZip "Node.js 22 LTS portatil"
    Expand-ToDir  $nodeZip $nodeTmp

    # Mover conteudo da pasta versionada
    $inner = Get-ChildItem $nodeTmp -Directory | Select-Object -First 1
    if ($inner) {
        Get-ChildItem $inner.FullName | Copy-Item -Destination $nodeDir -Recurse -Force
    }
    Remove-Item $nodeZip, $nodeTmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-OK "Node.js portatil copiado para bundle\node\"
}

# ─────────────────────────────────────────────────────────────────────────────
# 7. Verificar tamanho do bundle
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Verificando bundle"
$sizeMB = [Math]::Round((Get-ChildItem $BundleDir -Recurse -File |
    Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Write-OK "Bundle pronto: $sizeMB MB em $BundleDir"

# ─────────────────────────────────────────────────────────────────────────────
# 8. Inno Setup
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Localizando Inno Setup"

if (-not $IsccPath) {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\iscc.exe",
        "${env:ProgramFiles}\Inno Setup 6\iscc.exe",
        "C:\InnoSetup\iscc.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $IsccPath = $c; break }
    }
}

if (-not $IsccPath -or -not (Test-Path $IsccPath)) {
    Write-Fail "Inno Setup nao encontrado."
    Write-Host ""
    Write-Host "  Instale o Inno Setup 6: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Apos instalar, execute novamente ou informe o caminho:" -ForegroundColor Yellow
    Write-Host "  .\build-installer.ps1 -IsccPath 'C:\InnoSetup\iscc.exe'" -ForegroundColor White
    Write-Host ""

    # Perguntar se quer apenas preparar o bundle sem gerar o .exe
    Write-Host "  O bundle esta pronto em: $BundleDir" -ForegroundColor Green
    Write-Host "  Para gerar o .exe depois: & '$IsccPath' installer.iss" -ForegroundColor DarkGray
    exit 1
}

Write-OK "Inno Setup encontrado: $IsccPath"

# ─────────────────────────────────────────────────────────────────────────────
# 9. Compilar o instalador
# ─────────────────────────────────────────────────────────────────────────────
Write-Step "Compilando instalador .exe com Inno Setup"

New-Item -ItemType Directory -Force -Path $OutputDirFinal | Out-Null

$issFile = Join-Path $ScriptDir "installer.iss"

# Sobrescrever OutputDir no .iss via /O
$args = @(
    "/O$OutputDirFinal",
    "/DAppVersion=$APP_VERSION",
    $issFile
)

Write-Info "& iscc.exe $($args -join ' ')"
$result = & $IsccPath @args 2>&1
$result | ForEach-Object { Write-Info $_ }

if ($LASTEXITCODE -ne 0) {
    Write-Fail "Inno Setup retornou codigo $LASTEXITCODE"
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 10. Resumo final
# ─────────────────────────────────────────────────────────────────────────────
$exeFile = Get-ChildItem $OutputDirFinal -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host ""
Write-Host "  +==========================================================+" -ForegroundColor Green
Write-Host "  |  Build concluido!                                        |" -ForegroundColor Green
Write-Host "  +==========================================================+" -ForegroundColor Green
Write-Host ""
if ($exeFile) {
    $sizeMB2 = [Math]::Round($exeFile.Length / 1MB, 1)
    Write-Host "  Instalador: $($exeFile.FullName)" -ForegroundColor White
    Write-Host "  Tamanho   : $sizeMB2 MB"           -ForegroundColor White
}
Write-Host ""
Write-Host "  Distribua o arquivo .exe para as clinicas." -ForegroundColor DarkGray
Write-Host "  O usuario deve executar como Administrador e seguir o assistente." -ForegroundColor DarkGray
Write-Host ""
