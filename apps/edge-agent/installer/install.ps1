<#
.SYNOPSIS
    SmartPACS Edge Agent -- Instalador Windows

.DESCRIPTION
    Instala e configura o SmartPACS Edge Agent como servico Windows.
    Modo interativo (assistente) ou silencioso (automacao/MDM).

.PARAMETER InstallDir
    Diretorio de instalacao. Padrao: C:\SmartPACS\EdgeAgent

.PARAMETER AgentId
    ID do agente obtido no portal SmartPACS apos registrar o agente.

.PARAMETER ApiKey
    API Key obtida no portal SmartPACS (exibida uma unica vez).

.PARAMETER ClinicId
    ID da clinica associada (para referencia no .env).

.PARAMETER CloudApiUrl
    URL do servidor SmartPACS. Padrao: http://localhost:3001

.PARAMETER AeTitle
    AE Title DICOM (max 16 chars). Padrao: SMARTPACS

.PARAMETER DicomPort
    Porta TCP do receptor DICOM. Padrao: 104

.PARAMETER ServiceName
    Nome do servico Windows. Padrao: SmartPACSAgent

.PARAMETER Silent
    Executa sem prompts. Requer AgentId e ApiKey.

.PARAMETER Uninstall
    Remove o agente, servico e regras de firewall.

.PARAMETER NoService
    Pula a instalacao do servico Windows.

.PARAMETER NoFirewall
    Pula a criacao da regra de firewall.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Silent `
        -AgentId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
        -ApiKey  "agt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" `
        -CloudApiUrl "https://api.smartpacs.com.br"

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
#>

param(
    [string]$InstallDir  = "",
    [string]$AgentId     = "",
    [string]$ApiKey      = "",
    [string]$ClinicId    = "",
    [string]$CloudApiUrl = "",
    [string]$AeTitle     = "",
    [int]   $DicomPort   = 0,
    [string]$ServiceName = "SmartPACSAgent",
    [switch]$Silent,
    [switch]$Uninstall,
    [switch]$NoService,
    [switch]$NoFirewall
)

$ErrorActionPreference = "Continue"

# ============================================================
# Constantes
# ============================================================
$INSTALLER_VERSION  = "1.0.0"
$DEFAULT_INSTALL    = "C:\SmartPACS\EdgeAgent"
$DEFAULT_CLOUD_URL  = "http://localhost:3001"
$DEFAULT_AE_TITLE   = "SMARTPACS"
$DEFAULT_PORT       = 104
$NODE_MIN_VER       = "22.5.0"
$NODE_ZIP_URL       = "https://nodejs.org/dist/v22.13.1/node-v22.13.1-win-x64.zip"
$NSSM_ZIP_URL       = "https://nssm.cc/release/nssm-2.24.zip"
$DCMTK_ZIP_URL      = "https://dicom.offis.de/download/dcmtk/dcmtk368/bin/dcmtk-3.6.8-win64-dynamic.zip"

$script:LogFile = $null

# ============================================================
# Helpers de log e UI
# ============================================================
function Write-Log {
    param([string]$Msg, [string]$Level = "INFO")
    if ($script:LogFile) {
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path $script:LogFile -Value "[$ts][$Level] $Msg" -Encoding UTF8 -ErrorAction SilentlyContinue
    }
}

function Write-Step {
    param([string]$Title)
    Write-Host ""
    Write-Host "  --- $Title" -ForegroundColor Cyan
    Write-Log "STEP: $Title"
}

function Write-OK {
    param([string]$Msg)
    Write-Host "  [OK] $Msg" -ForegroundColor Green
    Write-Log "OK: $Msg"
}

function Write-Warn {
    param([string]$Msg)
    Write-Host "  [!]  $Msg" -ForegroundColor Yellow
    Write-Log "WARN: $Msg" "WARN"
}

function Write-Fail {
    param([string]$Msg)
    Write-Host "  [X]  $Msg" -ForegroundColor Red
    Write-Log "FAIL: $Msg" "ERROR"
}

function Write-Info {
    param([string]$Msg)
    Write-Host "       $Msg" -ForegroundColor DarkGray
    Write-Log "INFO: $Msg"
}

function Read-Value {
    param(
        [string]$Label,
        [string]$Default = "",
        [switch]$Secret,
        [switch]$Required
    )
    $hint = if ($Default) { " [$Default]" } else { "" }
    Write-Host "  $Label$hint : " -NoNewline -ForegroundColor White
    if ($Secret) {
        $ss   = Read-Host -AsSecureString
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
        $val  = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    } else {
        $val = Read-Host
    }
    $val = $val.Trim()
    if ([string]::IsNullOrEmpty($val)) {
        if ($Default) { return $Default }
        if ($Required) {
            Write-Host "  * Campo obrigatorio." -ForegroundColor Red
            return Read-Value -Label $Label -Default $Default -Secret:$Secret -Required
        }
    }
    return $val
}

function Read-YesNo {
    param([string]$Label, [bool]$Default = $true)
    $opts = if ($Default) { "S/n" } else { "s/N" }
    Write-Host "  $Label [$opts]: " -NoNewline -ForegroundColor Yellow
    $r = (Read-Host).Trim()
    if ([string]::IsNullOrEmpty($r)) { return $Default }
    return ($r -imatch "^s")
}

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  +======================================================+" -ForegroundColor Cyan
    Write-Host "  |                                                      |" -ForegroundColor Cyan
    Write-Host "  |    SmartPACS -- Edge Agent Installer v$INSTALLER_VERSION         |" -ForegroundColor Cyan
    Write-Host "  |                                                      |" -ForegroundColor Cyan
    Write-Host "  +======================================================+" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Receptor DICOM + Sincronizacao para Nuvem" -ForegroundColor DarkGray
    Write-Host ""
}

# ============================================================
# Admin check
# ============================================================
function Assert-Admin {
    $id  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr  = [Security.Principal.WindowsPrincipal]$id
    $adm = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $adm) {
        Write-Host ""
        Write-Host "  ERRO: Execute como Administrador." -ForegroundColor Red
        Write-Host "  Botao direito no script > 'Executar como Administrador'." -ForegroundColor Yellow
        Write-Host ""
        if (-not $Silent) { Read-Host "  Pressione Enter para sair" | Out-Null }
        exit 1
    }
}

# ============================================================
# Node.js
# ============================================================
function Get-NodeVersion {
    try {
        $raw = & node --version 2>$null
        if ($raw) { return [version]($raw.TrimStart("v").Trim()) }
    } catch { }
    return $null
}

function Install-NodePortable {
    param([string]$TargetDir)
    $zipPath = Join-Path $env:TEMP "node-portable.zip"
    $nodeDir = Join-Path $TargetDir "node"
    Write-Info "Baixando Node.js LTS (portatil)..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $NODE_ZIP_URL -OutFile $zipPath -UseBasicParsing
        New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
        Expand-Archive -Path $zipPath -DestinationPath $nodeDir -Force
        $inner = Get-ChildItem $nodeDir -Directory | Select-Object -First 1
        if ($inner) {
            Get-ChildItem $inner.FullName | Move-Item -Destination $nodeDir
            Remove-Item $inner.FullName -Recurse -Force
        }
        $env:Path = "$nodeDir;$env:Path"
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        $v = Get-NodeVersion
        if ($v) {
            Write-OK "Node.js $v instalado em $nodeDir"
            return $nodeDir
        }
    } catch {
        Write-Fail "Falha ao instalar Node.js: $_"
    }
    return $null
}

function Ensure-NodeJS {
    param([string]$TargetDir)
    # Tenta winget primeiro
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Info "Instalando Node.js via winget..."
        & winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("Path","User")
        $v = Get-NodeVersion
        if ($v -and $v -ge [version]$NODE_MIN_VER) {
            Write-OK "Node.js $v instalado via winget"
            return (Get-Command node).Source
        }
    }
    # Fallback portatil
    $nodeDir = Install-NodePortable -TargetDir $TargetDir
    if ($nodeDir) { return (Join-Path $nodeDir "node.exe") }
    return $null
}

# ============================================================
# DCMTK
# ============================================================
function Test-Dcmtk {
    try {
        $out = & storescp --version 2>&1
        if ("$out" -match "storescp|DCMTK") { return $true }
    } catch { }
    return $false
}

function Install-Dcmtk {
    param([string]$TargetDir)
    $zipPath = Join-Path $env:TEMP "dcmtk.zip"
    $dcmDir  = Join-Path $TargetDir "dcmtk"
    Write-Info "Baixando DCMTK..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $DCMTK_ZIP_URL -OutFile $zipPath -UseBasicParsing
        New-Item -ItemType Directory -Force -Path $dcmDir | Out-Null
        Expand-Archive -Path $zipPath -DestinationPath $dcmDir -Force
        $binDir = Get-ChildItem -Recurse $dcmDir -Directory -Filter "bin" | Select-Object -First 1
        $binPath = if ($binDir) { $binDir.FullName } else { $dcmDir }
        $sysPath = [Environment]::GetEnvironmentVariable("Path","Machine")
        if ($sysPath -notlike "*$binPath*") {
            [Environment]::SetEnvironmentVariable("Path","$sysPath;$binPath","Machine")
        }
        $env:Path = "$env:Path;$binPath"
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        Write-OK "DCMTK instalado em $binPath"
        return $true
    } catch {
        Write-Warn "Falha ao instalar DCMTK: $_ -- modo file-watcher sera usado."
        return $false
    }
}

# ============================================================
# NSSM
# ============================================================
function Find-Nssm {
    $candidates = @(
        "C:\nssm\nssm.exe",
        "C:\tools\nssm\nssm.exe",
        "$env:ProgramFiles\nssm\nssm.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Install-Nssm {
    param([string]$TargetDir)
    $nssmDir = Join-Path $TargetDir "nssm"
    New-Item -ItemType Directory -Force -Path $nssmDir | Out-Null

    # Fontes em ordem de prioridade (nssm.cc pode estar instavel)
    $urls = @(
        "https://nssm.cc/release/nssm-2.24.zip",
        "https://github.com/nicholasgasior/nssm/raw/master/nssm-2.24.zip"
    )

    foreach ($url in $urls) {
        $zipPath = Join-Path $env:TEMP "nssm.zip"
        Write-Info "Baixando NSSM de $url ..."
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing -TimeoutSec 30
            Expand-Archive -Path $zipPath -DestinationPath $nssmDir -Force
            $exe = Get-ChildItem -Recurse $nssmDir -Filter "nssm.exe" |
                   Where-Object { $_.DirectoryName -like "*win64*" } |
                   Select-Object -First 1
            if (-not $exe) {
                $exe = Get-ChildItem -Recurse $nssmDir -Filter "nssm.exe" | Select-Object -First 1
            }
            if ($exe) {
                $dest = Join-Path $nssmDir "nssm.exe"
                if ($exe.FullName -ne $dest) { Copy-Item $exe.FullName $dest -Force }
                Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
                Write-OK "NSSM instalado em $dest"
                return $dest
            }
        } catch {
            Write-Warn "Falha ao baixar de $url : $_"
        }
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    }

    # Fallback: WinSW (Windows Service Wrapper) -- alternativa ao NSSM
    Write-Info "Tentando WinSW como alternativa ao NSSM..."
    $winswUrl  = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"
    $winswDest = Join-Path $nssmDir "winsw.exe"
    try {
        Invoke-WebRequest -Uri $winswUrl -OutFile $winswDest -UseBasicParsing -TimeoutSec 60
        if (Test-Path $winswDest) {
            # Criar wrapper que emula interface NSSM basica
            $wrapperPath = Join-Path $nssmDir "nssm.exe"
            Copy-Item $winswDest $wrapperPath -Force
            Write-OK "WinSW instalado como nssm.exe em $wrapperPath"
            Write-Warn "WinSW requer XML de configuracao -- use Register-WinServiceDirect para instalar."
            return $null  # Sinaliza para usar sc.exe direto
        }
    } catch {
        Write-Warn "WinSW tambem falhou: $_"
    }

    Write-Warn "Nenhum gerenciador de servico baixado. Usando sc.exe nativo."
    return "sc.exe"  # Valor especial: usa sc.exe como fallback
}

# ============================================================
# Copiar arquivos do agente
# ============================================================
function Copy-AgentFiles {
    param([string]$InstallerDir, [string]$DestDir)

    # Opcao 1: pacote pre-compilado bundle\ ao lado do instalador
    $bundleDir = Join-Path $InstallerDir "bundle"
    if (Test-Path (Join-Path $bundleDir "dist\main.js")) {
        Write-Info "Copiando pacote pre-compilado..."
        Copy-Item "$bundleDir\*" $DestDir -Recurse -Force
        Write-OK "Arquivos copiados do pacote"
        return $true
    }

    # Opcao 2: repositorio monorepo (installer\ esta dentro de apps\edge-agent\)
    $agentRoot  = Split-Path $InstallerDir -Parent          # apps\edge-agent
    $monoRoot   = Split-Path (Split-Path $agentRoot -Parent) -Parent  # raiz do monorepo
    $isMonorepo = (Test-Path (Join-Path $monoRoot "turbo.json")) -or
                  (Test-Path (Join-Path $monoRoot "package.json"))

    if (Test-Path (Join-Path $agentRoot "package.json")) {
        Write-Info "Copiando codigo-fonte de $agentRoot ..."
        foreach ($item in @("src","package.json","tsconfig.json","nest-cli.json",".env.example")) {
            $src = Join-Path $agentRoot $item
            if (Test-Path $src) {
                Copy-Item $src $DestDir -Recurse -Force
            }
        }

        # Se estamos no monorepo, copiar tambem o pacote @smartpacs/types ja compilado
        # (nao esta no npm publico -- e um pacote interno do workspace)
        $typesDistSrc = Join-Path $monoRoot "packages\types\dist"
        $typesDistDst = Join-Path $DestDir "node_modules\@smartpacs\types"
        if ($isMonorepo -and (Test-Path $typesDistSrc)) {
            Write-Info "Copiando @smartpacs/types do workspace..."
            New-Item -ItemType Directory -Force -Path $typesDistDst | Out-Null
            Copy-Item "$typesDistSrc\*" $typesDistDst -Recurse -Force
            # Copiar package.json do types
            $typesPkg = Join-Path $monoRoot "packages\types\package.json"
            if (Test-Path $typesPkg) { Copy-Item $typesPkg $typesDistDst -Force }
            Write-OK "@smartpacs/types copiado"
        } elseif ($isMonorepo) {
            # Compilar @smartpacs/types primeiro
            Write-Info "Compilando @smartpacs/types..."
            $typesRoot = Join-Path $monoRoot "packages\types"
            Push-Location $typesRoot
            try {
                & npm run build 2>&1 | ForEach-Object { Write-Info $_ }
                if ($LASTEXITCODE -eq 0 -and (Test-Path $typesDistSrc)) {
                    New-Item -ItemType Directory -Force -Path $typesDistDst | Out-Null
                    Copy-Item "$typesDistSrc\*" $typesDistDst -Recurse -Force
                    Copy-Item (Join-Path $typesRoot "package.json") $typesDistDst -Force
                    Write-OK "@smartpacs/types compilado e copiado"
                }
            } finally {
                Pop-Location
            }
        }

        Write-OK "Codigo-fonte copiado de $agentRoot"
        return $true
    }

    Write-Fail "Arquivos do agente nao encontrados."
    Write-Info "Execute install.ps1 a partir da pasta installer\ do repositorio SmartPACS."
    return $false
}

# ============================================================
# Build
# ============================================================
function Invoke-AgentBuild {
    param([string]$AgentDir)

    if (Test-Path (Join-Path $AgentDir "dist\main.js")) {
        Write-OK "Build pre-compilado encontrado (dist\main.js)"
        return $true
    }

    Push-Location $AgentDir
    try {
        # Usar --legacy-peer-deps para evitar conflitos, e ignorar @smartpacs/types
        # se ja foi copiado manualmente para node_modules
        Write-Info "npm install --omit=dev ..."
        & npm install --omit=dev --no-audit --no-fund --legacy-peer-deps 2>&1 | ForEach-Object { Write-Info $_ }
        if ($LASTEXITCODE -ne 0) {
            # Tentar com --force como ultimo recurso
            Write-Warn "npm install falhou, tentando com --force..."
            & npm install --omit=dev --no-audit --no-fund --force 2>&1 | ForEach-Object { Write-Info $_ }
            if ($LASTEXITCODE -ne 0) { Write-Fail "npm install falhou"; return $false }
        }

        Write-Info "npm run build ..."
        & npm run build 2>&1 | ForEach-Object { Write-Info $_ }
        if ($LASTEXITCODE -ne 0) { Write-Fail "npm run build falhou"; return $false }

        Write-OK "Build concluido"
        return $true
    } catch {
        Write-Fail "Erro no build: $_"
        return $false
    } finally {
        Pop-Location
    }
}

# ============================================================
# Criar .env
# ============================================================
function New-EnvFile {
    param(
        [string]$AgentDir,
        [string]$AgentId,
        [string]$ApiKey,
        [string]$ClinicId,
        [string]$CloudApiUrl,
        [string]$AeTitle,
        [int]   $DicomPort,
        [string]$StoragePath
    )

    $lines = @(
        "# SmartPACS Edge Agent -- gerado em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "# Nao compartilhe este arquivo -- contem credenciais sensiveis.",
        "",
        "# Identidade do agente",
        "EDGE_AGENT_ID=$AgentId",
        "EDGE_AGENT_CLINIC_ID=$ClinicId",
        "EDGE_AGENT_API_KEY=$ApiKey",
        "",
        "# Conexao com o servidor",
        "CLOUD_API_URL=$CloudApiUrl",
        "",
        "# HTTP local",
        "AGENT_HTTP_PORT=3002",
        "",
        "# DICOM SCP",
        "DICOM_AE_TITLE=$AeTitle",
        "DICOM_PORT=$DicomPort",
        "DICOM_ALLOWED_AE_TITLES=",
        "",
        "# Armazenamento local",
        "STORAGE_PATH=$StoragePath",
        "DICOM_RECEIVED_DIR=$StoragePath\received",
        "DICOM_PROCESSED_DIR=$StoragePath\processed",
        "DICOM_FAILED_DIR=$StoragePath\failed",
        "",
        "# Sincronizacao",
        "HEARTBEAT_INTERVAL=15",
        "SYNC_INTERVAL=30",
        "MAX_CONCURRENT_UPLOADS=3",
        "CHUNK_SIZE_MB=8"
    )

    $envPath = Join-Path $AgentDir ".env"
    [System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.Encoding]::UTF8)
    Write-OK "Arquivo .env criado"
}

# ============================================================
# Servico Windows
# ============================================================
function Register-WinService {
    param(
        [string]$NssmExe,
        [string]$SvcName,
        [string]$AgentDir,
        [string]$NodeExe
    )

    $mainJs = Join-Path $AgentDir "dist\main.js"
    $logDir = Join-Path $AgentDir "storage\logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    # Remover servico anterior
    $existing = Get-Service -Name $SvcName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Info "Parando servico existente '$SvcName'..."
        if ($NssmExe -ne "sc.exe") {
            & $NssmExe stop $SvcName 2>$null | Out-Null
        } else {
            & sc.exe stop $SvcName 2>$null | Out-Null
        }
        Start-Sleep -Seconds 3
        if ($NssmExe -ne "sc.exe") {
            & $NssmExe remove $SvcName confirm 2>$null | Out-Null
        } else {
            & sc.exe delete $SvcName 2>$null | Out-Null
        }
    }

    if ($NssmExe -ne "sc.exe" -and (Test-Path $NssmExe)) {
        # Instalar via NSSM (com log rotation e restart automatico)
        Write-Info "Criando servico '$SvcName' via NSSM..."
        & $NssmExe install $SvcName $NodeExe $mainJs                              | Out-Null
        & $NssmExe set     $SvcName AppDirectory      $AgentDir                   | Out-Null
        & $NssmExe set     $SvcName AppStdout         "$logDir\agent.log"         | Out-Null
        & $NssmExe set     $SvcName AppStderr         "$logDir\agent-error.log"   | Out-Null
        & $NssmExe set     $SvcName AppRotateFiles    1                           | Out-Null
        & $NssmExe set     $SvcName AppRotateOnline   1                           | Out-Null
        & $NssmExe set     $SvcName AppRotateBytes    10485760                    | Out-Null
        & $NssmExe set     $SvcName Start             SERVICE_AUTO_START          | Out-Null
        & $NssmExe set     $SvcName DisplayName       "SmartPACS Edge Agent"     | Out-Null
        & $NssmExe set     $SvcName Description       "Receptor DICOM SmartPACS" | Out-Null
        & $NssmExe set     $SvcName ObjectName        LocalSystem                 | Out-Null
        Write-OK "Servico '$SvcName' registrado via NSSM"
    } else {
        # Fallback: sc.exe nativo do Windows
        Write-Info "Criando servico '$SvcName' via sc.exe (sem NSSM)..."
        $binPath = "`"$NodeExe`" `"$mainJs`""
        & sc.exe create $SvcName binPath= $binPath start= auto obj= LocalSystem | Out-Null
        & sc.exe description $SvcName "Receptor DICOM e agente SmartPACS" | Out-Null
        # Reiniciar automaticamente em caso de falha
        & sc.exe failure $SvcName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
        Write-OK "Servico '$SvcName' registrado via sc.exe"
        Write-Warn "Sem NSSM: logs nao serao rotacionados automaticamente."
    }
}

function Start-WinService {
    param([string]$NssmExe, [string]$SvcName, [int]$TimeoutSec = 45)

    Write-Info "Iniciando servico '$SvcName'..."
    & $NssmExe start $SvcName 2>$null | Out-Null

    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        Start-Sleep -Seconds 2
        $elapsed += 2
        $svc = Get-Service -Name $SvcName -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq "Running") {
            Write-OK "Servico '$SvcName' ativo"
            return $true
        }
        Write-Host "." -NoNewline -ForegroundColor DarkGray
    }

    Write-Warn "Servico nao ficou Running em ${TimeoutSec}s."
    Write-Info "Verifique: $InstallDir\storage\logs\agent-error.log"
    return $false
}

# ============================================================
# Firewall
# ============================================================
function Set-DicomFirewall {
    param([int]$Port)
    $rule = "SmartPACS Edge Agent - DICOM SCP"
    Remove-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue | Out-Null
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP `
        -LocalPort $Port -Action Allow `
        -Description "Porta DICOM C-STORE para SmartPACS Edge Agent" | Out-Null
    Write-OK "Regra de firewall criada (TCP $Port)"
}

# ============================================================
# Atalhos
# ============================================================
function New-Shortcuts {
    param([string]$AgentDir, [string]$SvcName, [string]$NssmExe)
    try {
        $shell = New-Object -ComObject WScript.Shell
        $sc = $shell.CreateShortcut("$env:Public\Desktop\SmartPACS Agent - Logs.lnk")
        $sc.TargetPath = Join-Path $AgentDir "storage\logs"
        $sc.Description = "SmartPACS Edge Agent - Logs"
        $sc.Save()
        Write-OK "Atalho criado na area de trabalho"
    } catch {
        Write-Warn "Nao foi possivel criar atalho: $_"
    }
}

# ============================================================
# Desinstalacao
# ============================================================
function Invoke-Uninstall {
    Write-Banner
    Write-Host "  Desinstalacao do SmartPACS Edge Agent" -ForegroundColor Yellow
    Write-Host ""
    if (-not $Silent) {
        if (-not (Read-YesNo "Confirmar desinstalacao?" $false)) {
            Write-Host "  Cancelado." -ForegroundColor DarkGray
            exit 0
        }
    }

    $dir = if ($InstallDir) { $InstallDir } else { $DEFAULT_INSTALL }

    $nssmExe = Find-Nssm
    if ($nssmExe) {
        & $nssmExe stop   $ServiceName 2>$null | Out-Null
        Start-Sleep -Seconds 3
        & $nssmExe remove $ServiceName confirm 2>$null | Out-Null
        Write-OK "Servico removido via NSSM"
    } else {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        & sc.exe delete $ServiceName 2>$null | Out-Null
        Write-OK "Servico removido via sc.exe"
    }

    Remove-NetFirewallRule -DisplayName "SmartPACS Edge Agent - DICOM SCP" -ErrorAction SilentlyContinue | Out-Null
    Write-OK "Regra de firewall removida"

    if (Test-Path $dir) {
        $keepStorage = if ($Silent) { $true } else { Read-YesNo "Manter dados de storage?" $true }
        if ($keepStorage) {
            Get-ChildItem $dir -Exclude "storage" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            Write-OK "Arquivos removidos (storage mantido em $dir\storage)"
        } else {
            Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
            Write-OK "Diretorio $dir removido"
        }
    }

    Remove-Item "$env:Public\Desktop\SmartPACS Agent*.lnk" -Force -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "  Desinstalacao concluida." -ForegroundColor Green
    exit 0
}

# ============================================================
# EXECUCAO PRINCIPAL
# ============================================================

Assert-Admin

# Iniciar log
$logDir0 = Join-Path $env:TEMP "SmartPACSInstaller"
New-Item -ItemType Directory -Force -Path $logDir0 | Out-Null
$script:LogFile = Join-Path $logDir0 "install-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
Write-Log "Installer v$INSTALLER_VERSION iniciado"

if ($Uninstall) { Invoke-Uninstall }

Write-Banner

if (-not $Silent) {
    Write-Host "  Este assistente instala o SmartPACS Edge Agent." -ForegroundColor DarkGray
    Write-Host "  PRE-REQUISITO: registre o agente no portal antes de continuar." -ForegroundColor Yellow
    Write-Host "  (Portal -> Agentes Edge -> Registrar Agente)" -ForegroundColor Yellow
    Write-Host ""
    if (-not (Read-YesNo "Continuar com a instalacao?" $true)) {
        Write-Host "  Cancelado." -ForegroundColor DarkGray
        exit 0
    }
}

# --- Configuracao ----------------------------------------------------
Write-Step "Configuracao"
Write-Host ""

if (-not $InstallDir) {
    $InstallDir = if ($Silent) { $DEFAULT_INSTALL } else { Read-Value "Diretorio de instalacao" $DEFAULT_INSTALL }
}

if (-not $Silent) { Write-Host "`n  -- Credenciais (obtidas no portal SmartPACS) --" -ForegroundColor Cyan }
if (-not $AgentId) {
    if ($Silent) { Write-Fail "-AgentId obrigatorio no modo silencioso"; exit 1 }
    $AgentId = Read-Value "Agent ID" "" -Required
}
if (-not $ApiKey) {
    if ($Silent) { Write-Fail "-ApiKey obrigatoria no modo silencioso"; exit 1 }
    $ApiKey = Read-Value "API Key" "" -Secret -Required
}
if (-not $ClinicId -and -not $Silent) {
    $ClinicId = Read-Value "Clinic ID (opcional)" ""
}
if (-not $CloudApiUrl) {
    $CloudApiUrl = if ($Silent) { $DEFAULT_CLOUD_URL } else { Read-Value "URL da API SmartPACS" $DEFAULT_CLOUD_URL }
}

if (-not $Silent) { Write-Host "`n  -- Configuracao DICOM --" -ForegroundColor Cyan }
if (-not $AeTitle) {
    $AeTitle = if ($Silent) { $DEFAULT_AE_TITLE } else { Read-Value "AE Title DICOM (max 16 chars)" $DEFAULT_AE_TITLE }
}
$AeTitle = $AeTitle.ToUpper().Substring(0, [Math]::Min($AeTitle.Length, 16)).Trim()

if ($DicomPort -le 0) {
    if ($Silent) {
        $DicomPort = $DEFAULT_PORT
    } else {
        $DicomPort = [int](Read-Value "Porta DICOM" $DEFAULT_PORT.ToString())
    }
}

if (-not $Silent) { Write-Host "`n  -- Servico Windows --" -ForegroundColor Cyan }
$installService = (-not $NoService)
if ($installService -and -not $Silent) {
    $ServiceName    = Read-Value "Nome do servico Windows" $ServiceName
    $installService = Read-YesNo "Instalar como servico automatico?" $true
}

$StoragePath = Join-Path $InstallDir "storage"

# --- Resumo ----------------------------------------------------------
Write-Host ""
Write-Host "  +-- Resumo -----------------------------------------+" -ForegroundColor White
Write-Host "  | Diretorio   : $InstallDir" -ForegroundColor White
Write-Host "  | Cloud API   : $CloudApiUrl" -ForegroundColor White
Write-Host "  | Agent ID    : $AgentId" -ForegroundColor White
Write-Host "  | AE Title    : $AeTitle" -ForegroundColor White
Write-Host "  | Porta DICOM : $DicomPort" -ForegroundColor White
Write-Host "  | Servico     : $(if ($installService) { $ServiceName } else { '(nao instalar)' })" -ForegroundColor White
Write-Host "  +---------------------------------------------------+" -ForegroundColor White
Write-Host ""

if (-not $Silent) {
    if (-not (Read-YesNo "Confirmar e instalar?" $true)) {
        Write-Host "  Cancelado." -ForegroundColor DarkGray
        exit 0
    }
}

# --- Criar diretorios ------------------------------------------------
Write-Step "Criando estrutura de diretorios"
foreach ($sub in @("","storage","storage\received","storage\processed","storage\failed","storage\logs")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir $sub) | Out-Null
}
Write-OK "Diretorios criados em $InstallDir"

# --- Node.js ---------------------------------------------------------
Write-Step "Verificando Node.js"
$nodeVer = Get-NodeVersion
$nodeOK  = ($nodeVer -and $nodeVer -ge [version]$NODE_MIN_VER)

if ($nodeOK) {
    Write-OK "Node.js $nodeVer ja instalado"
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue)
    $nodeExe = if ($nodeExe) { $nodeExe.Source } else { "node" }
} else {
    if ($nodeVer) { Write-Warn "Node.js $nodeVer encontrado mas requer $NODE_MIN_VER+" }
    else          { Write-Warn "Node.js nao encontrado" }
    $nodeExe = Ensure-NodeJS -TargetDir $InstallDir
    if (-not $nodeExe) {
        Write-Fail "Node.js nao instalado. Instale manualmente: https://nodejs.org"
        exit 1
    }
}

# --- DCMTK -----------------------------------------------------------
Write-Step "Verificando DCMTK"
if (Test-Dcmtk) {
    Write-OK "DCMTK (storescp) encontrado"
} else {
    Write-Warn "storescp nao encontrado -- instalando DCMTK..."
    $ok = Install-Dcmtk -TargetDir $InstallDir
    if (-not $ok) {
        Write-Warn "DCMTK nao instalado. Modo file-watcher sera usado."
    }
}

# --- NSSM ------------------------------------------------------------
$nssmExe = $null
if ($installService) {
    Write-Step "Verificando NSSM"
    $nssmExe = Find-Nssm
    if ($nssmExe) {
        Write-OK "NSSM encontrado: $nssmExe"
    } else {
        $nssmExe = Install-Nssm -TargetDir $InstallDir
        if (-not $nssmExe) {
            Write-Warn "NSSM nao disponivel -- servico nao sera instalado."
            $installService = $false
        }
    }
}

# --- Copiar arquivos -------------------------------------------------
Write-Step "Copiando arquivos do Edge Agent"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ok = Copy-AgentFiles -InstallerDir $scriptDir -DestDir $InstallDir
if (-not $ok) {
    Write-Fail "Nao foi possivel copiar os arquivos."
    exit 1
}

# --- Build -----------------------------------------------------------
Write-Step "Compilando Edge Agent"
$ok = Invoke-AgentBuild -AgentDir $InstallDir
if (-not $ok) {
    Write-Fail "Build falhou."
    exit 1
}

# --- .env ------------------------------------------------------------
Write-Step "Criando configuracao (.env)"
New-EnvFile `
    -AgentDir    $InstallDir `
    -AgentId     $AgentId `
    -ApiKey      $ApiKey `
    -ClinicId    $ClinicId `
    -CloudApiUrl $CloudApiUrl `
    -AeTitle     $AeTitle `
    -DicomPort   $DicomPort `
    -StoragePath $StoragePath

# --- Servico Windows -------------------------------------------------
$serviceStarted = $false
if ($installService -and $nssmExe) {
    Write-Step "Instalando servico Windows"
    Register-WinService -NssmExe $nssmExe -SvcName $ServiceName -AgentDir $InstallDir -NodeExe $nodeExe
    $serviceStarted = Start-WinService -NssmExe $nssmExe -SvcName $ServiceName
    New-Shortcuts -AgentDir $InstallDir -SvcName $ServiceName -NssmExe $nssmExe
}

# --- Firewall --------------------------------------------------------
if (-not $NoFirewall) {
    Write-Step "Configurando firewall"
    Set-DicomFirewall -Port $DicomPort
}

# --- IP local --------------------------------------------------------
$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.InterfaceAlias -notlike "*vEthernet*" } |
    Select-Object -First 1).IPAddress

# --- Resumo final ----------------------------------------------------
Write-Host ""
Write-Host "  +======================================================+" -ForegroundColor Green
Write-Host "  |   Instalacao concluida com sucesso!                  |" -ForegroundColor Green
Write-Host "  +======================================================+" -ForegroundColor Green
Write-Host ""
Write-Host "  Instalado em : $InstallDir" -ForegroundColor White
Write-Host "  Servico      : $(if ($serviceStarted) { "$ServiceName (ATIVO)" } else { "nao iniciado como servico" })" -ForegroundColor White
Write-Host "  Logs         : $InstallDir\storage\logs\" -ForegroundColor White
Write-Host ""
Write-Host "  Configure seu equipamento DICOM:" -ForegroundColor Yellow
Write-Host "  +------------------------------------------------------+" -ForegroundColor Yellow
Write-Host "  | AE Title Destino : $AeTitle" -ForegroundColor Cyan
Write-Host "  | IP Destino       : $localIp" -ForegroundColor Cyan
Write-Host "  | Porta Destino    : $DicomPort" -ForegroundColor Cyan
Write-Host "  +------------------------------------------------------+" -ForegroundColor Yellow
Write-Host ""
Write-Info "Log de instalacao: $script:LogFile"
Write-Host ""

if (-not $Silent) { Read-Host "  Pressione Enter para concluir" | Out-Null }
Write-Log "Instalacao concluida"
exit 0
