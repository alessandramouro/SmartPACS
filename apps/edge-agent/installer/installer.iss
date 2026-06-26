; ===========================================================================
; SmartPACS Edge Agent — Inno Setup Installer Script
; ===========================================================================
; Versao: 1.0.0
; Requer: Inno Setup 6.x  https://jrsoftware.org/isinfo.php
;
; Para compilar:
;   iscc.exe installer.iss
;
; O script espera que a pasta bundle\ ao lado deste arquivo contenha:
;   bundle\dist\           (JavaScript compilado)
;   bundle\node_modules\   (dependencias de producao)
;   bundle\package.json
;   bundle\nest-cli.json
;   bundle\tools\nssm\nssm.exe
;   bundle\tools\dcmtk\   (binarios DCMTK — storescp.exe etc.)
;   bundle\node\          (Node.js portatil — node.exe + npm)
;
; Esses arquivos sao gerados pelo script build-installer.ps1
; ===========================================================================

#define AppName       "SmartPACS Edge Agent"
#define AppVersion    "1.0.0"
#define AppPublisher  "SmartPACS"
#define AppURL        "https://smartpacs.com.br"
#define AppSvcName    "SmartPACSAgent"
#define AppMutex      "SmartPACSEdgeAgentInstaller"

[Setup]
AppId                    = {{A3B7C2D1-E4F5-4A6B-8C9D-0E1F2A3B4C5D}
AppName                  = {#AppName}
AppVersion               = {#AppVersion}
AppPublisher             = {#AppPublisher}
AppPublisherURL          = {#AppURL}
AppSupportURL            = {#AppURL}
AppUpdatesURL            = {#AppURL}
DefaultDirName           = {autopf}\SmartPACS\EdgeAgent
DefaultGroupName         = SmartPACS
AllowNoIcons             = yes
LicenseFile              =
OutputDir                = output
OutputBaseFilename       = SmartPACSEdgeAgent-Setup-{#AppVersion}
SetupIconFile            =
Compression              = lzma2/ultra64
SolidCompression         = yes
WizardStyle              = modern
WizardResizable          = yes
PrivilegesRequired       = admin
PrivilegesRequiredOverridesAllowed = commandline
AppMutex                 = {#AppMutex}
UninstallDisplayIcon     = {app}\node\node.exe
UninstallDisplayName     = {#AppName} {#AppVersion}
CreateUninstallRegKey    = yes
VersionInfoVersion       = {#AppVersion}
VersionInfoCompany       = {#AppPublisher}
VersionInfoDescription   = SmartPACS Edge Agent Installer
MinVersion               = 10.0
CloseApplications        = yes
CloseApplicationsFilter  = node.exe

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\Portuguese.isl"

[CustomMessages]
portuguese.WelcomeLabel2=Este assistente ira instalar o [name/ver] em seu computador.%n%nO Edge Agent recebe estudos DICOM de equipamentos de imagem e sincroniza automaticamente com o servidor SmartPACS.%n%nPRE-REQUISITO: registre este agente no portal SmartPACS (Agentes Edge -> Registrar Agente) antes de continuar.%n%nClique em Proximo para continuar.
portuguese.PageCloudTitle=Conexao com o Servidor SmartPACS
portuguese.PageCloudSubtitle=Informe o endereco do servidor central SmartPACS
portuguese.PageCredsTitle=Credenciais do Agente
portuguese.PageCredsSubtitle=Insira as credenciais obtidas no portal SmartPACS apos registrar este agente
portuguese.PageDicomTitle=Configuracao DICOM
portuguese.PageDicomSubtitle=Configure o receptor DICOM para aceitar conexoes dos equipamentos de imagem
portuguese.PageSvcTitle=Servico Windows
portuguese.PageSvcSubtitle=Configure como o agente sera executado em segundo plano
portuguese.LblCloudUrl=URL da API SmartPACS:
portuguese.LblAgentId=Agent ID:
portuguese.LblApiKey=API Key:
portuguese.LblClinicId=Clinic ID (opcional):
portuguese.LblAeTitle=AE Title DICOM (max 16 caracteres):
portuguese.LblDicomPort=Porta DICOM:
portuguese.LblSvcName=Nome do servico Windows:
portuguese.LblInstallSvc=Instalar como servico automatico (recomendado)
portuguese.ErrAgentIdRequired=O Agent ID e obrigatorio.
portuguese.ErrApiKeyRequired=A API Key e obrigatoria.
portuguese.ErrAeTitleLen=O AE Title deve ter no maximo 16 caracteres.
portuguese.ErrPortRange=A porta deve ser um numero entre 1024 e 65535.

[Dirs]
Name: "{app}"
Name: "{app}\storage"
Name: "{app}\storage\received"
Name: "{app}\storage\processed"
Name: "{app}\storage\failed"
Name: "{app}\storage\logs"
Name: "{app}\node"
Name: "{app}\dcmtk"
Name: "{app}\nssm"

[Files]
; Edge Agent (pre-compilado)
Source: "bundle\dist\*";          DestDir: "{app}\dist";          Flags: ignoreversion recursesubdirs createallsubdirs
Source: "bundle\node_modules\*";  DestDir: "{app}\node_modules";  Flags: ignoreversion recursesubdirs createallsubdirs
Source: "bundle\package.json";    DestDir: "{app}";               Flags: ignoreversion
Source: "bundle\nest-cli.json";   DestDir: "{app}";               Flags: ignoreversion

; Node.js portatil
Source: "bundle\node\*";          DestDir: "{app}\node";          Flags: ignoreversion recursesubdirs createallsubdirs

; DCMTK (receptor DICOM TCP)
Source: "bundle\tools\dcmtk\*";   DestDir: "{app}\dcmtk";         Flags: ignoreversion recursesubdirs createallsubdirs

; NSSM (gerenciador de servico Windows)
Source: "bundle\tools\nssm\nssm.exe"; DestDir: "{app}\nssm";      Flags: ignoreversion

[Icons]
Name: "{group}\SmartPACS Edge Agent - Logs";     Filename: "{app}\storage\logs"
Name: "{group}\Desinstalar SmartPACS Edge Agent"; Filename: "{uninstallexe}"
Name: "{commondesktop}\SmartPACS Agent - Logs";   Filename: "{app}\storage\logs"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na area de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer-postinstall.ps1"""; \
    Flags: runhidden waituntilterminated; \
    StatusMsg: "Configurando e iniciando o servico..."; \
    Description: "Configurar e iniciar o servico SmartPACS"

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""& '{app}\nssm\nssm.exe' stop {#AppSvcName}; Start-Sleep 3; & '{app}\nssm\nssm.exe' remove {#AppSvcName} confirm; Remove-NetFirewallRule -DisplayName 'SmartPACS Edge Agent - DICOM SCP' -ErrorAction SilentlyContinue"""; \
    Flags: runhidden waituntilterminated

; ===========================================================================
; Codigo Pascal — paginas customizadas
; ===========================================================================
[Code]

var
  PageCloud    : TInputQueryWizardPage;
  PageCreds    : TInputQueryWizardPage;
  PageDicom    : TInputQueryWizardPage;
  PageSvc      : TInputQueryWizardPage;
  ChkInstallSvc: TNewCheckBox;

// ---------------------------------------------------------------------------
// Cria as paginas customizadas do assistente
// ---------------------------------------------------------------------------
procedure InitializeWizard;
var
  lbl : TNewStaticText;
begin
  // ── Pagina 1: Conexao com o servidor ───────────────────────────────────
  PageCloud := CreateInputQueryPage(wpSelectDir,
    CustomMessage('PageCloudTitle'),
    CustomMessage('PageCloudSubtitle'),
    'Informe a URL completa do servidor SmartPACS ao qual este agente vai se conectar.');
  PageCloud.Add(CustomMessage('LblCloudUrl'), False);
  PageCloud.Values[0] := 'http://localhost:3001';

  // ── Pagina 2: Credenciais do agente ─────────────────────────────────────
  PageCreds := CreateInputQueryPage(PageCloud.ID,
    CustomMessage('PageCredsTitle'),
    CustomMessage('PageCredsSubtitle'),
    'Acesse o portal SmartPACS, va em Agentes Edge > Registrar Agente, e copie os dados abaixo.');
  PageCreds.Add(CustomMessage('LblAgentId'),  False);
  PageCreds.Add(CustomMessage('LblApiKey'),   True);
  PageCreds.Add(CustomMessage('LblClinicId'), False);

  // ── Pagina 3: Configuracao DICOM ─────────────────────────────────────────
  PageDicom := CreateInputQueryPage(PageCreds.ID,
    CustomMessage('PageDicomTitle'),
    CustomMessage('PageDicomSubtitle'),
    'O AE Title e a identidade DICOM deste agente. Configure o mesmo valor no equipamento de imagem.');
  PageDicom.Add(CustomMessage('LblAeTitle'),   False);
  PageDicom.Add(CustomMessage('LblDicomPort'), False);
  PageDicom.Values[0] := 'SMARTPACS';
  PageDicom.Values[1] := '104';

  // ── Pagina 4: Servico Windows ────────────────────────────────────────────
  PageSvc := CreateInputQueryPage(PageDicom.ID,
    CustomMessage('PageSvcTitle'),
    CustomMessage('PageSvcSubtitle'),
    '');
  PageSvc.Add(CustomMessage('LblSvcName'), False);
  PageSvc.Values[0] := 'SmartPACSAgent';

  // Checkbox "instalar como servico automatico"
  ChkInstallSvc               := TNewCheckBox.Create(PageSvc);
  ChkInstallSvc.Parent        := PageSvc.Surface;
  ChkInstallSvc.Top           := PageSvc.EditorOf(0).Top + PageSvc.EditorOf(0).Height + 20;
  ChkInstallSvc.Width         := PageSvc.SurfaceWidth;
  ChkInstallSvc.Caption       := CustomMessage('LblInstallSvc');
  ChkInstallSvc.Checked       := True;
end;

// ---------------------------------------------------------------------------
// Validacoes de cada pagina antes de prosseguir
// ---------------------------------------------------------------------------
function NextButtonClick(CurPageID: Integer): Boolean;
var
  port : Integer;
begin
  Result := True;

  if CurPageID = PageCreds.ID then begin
    if Trim(PageCreds.Values[0]) = '' then begin
      MsgBox(CustomMessage('ErrAgentIdRequired'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Trim(PageCreds.Values[1]) = '' then begin
      MsgBox(CustomMessage('ErrApiKeyRequired'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  if CurPageID = PageDicom.ID then begin
    if Length(Trim(PageDicom.Values[0])) > 16 then begin
      MsgBox(CustomMessage('ErrAeTitleLen'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if not TryStrToInt(Trim(PageDicom.Values[1]), port) or (port < 1024) or (port > 65535) then begin
      MsgBox(CustomMessage('ErrPortRange'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

// ---------------------------------------------------------------------------
// Escreve o script pos-instalacao com os valores coletados
// ---------------------------------------------------------------------------
procedure CurStepChanged(CurStep: TSetupStep);
var
  scriptPath   : String;
  lines        : TStringList;
  storagePath  : String;
  installSvc   : String;
begin
  if CurStep = ssPostInstall then begin
    storagePath := ExpandConstant('{app}') + '\storage';
    installSvc  := BoolToStr(ChkInstallSvc.Checked);

    lines := TStringList.Create;
    try
      lines.Add('# Gerado pelo instalador SmartPACS Edge Agent');
      lines.Add('$InstallDir   = "' + ExpandConstant('{app}') + '"');
      lines.Add('$AgentId      = "' + Trim(PageCreds.Values[0]) + '"');
      lines.Add('$ApiKey       = "' + Trim(PageCreds.Values[1]) + '"');
      lines.Add('$ClinicId     = "' + Trim(PageCreds.Values[2]) + '"');
      lines.Add('$CloudApiUrl  = "' + Trim(PageCloud.Values[0]) + '"');
      lines.Add('$AeTitle      = "' + Uppercase(Trim(PageDicom.Values[0])) + '"');
      lines.Add('$DicomPort    = ' + Trim(PageDicom.Values[1]));
      lines.Add('$ServiceName  = "' + Trim(PageSvc.Values[0]) + '"');
      lines.Add('$InstallSvc   = $' + BoolToStr(ChkInstallSvc.Checked));
      lines.Add('$NodeExe      = "$InstallDir\node\node.exe"');
      lines.Add('$NssmExe      = "$InstallDir\nssm\nssm.exe"');
      lines.Add('$StoragePath  = "' + storagePath + '"');
      lines.Add('');

      // Criar .env
      lines.Add('$envContent = @"');
      lines.Add('# SmartPACS Edge Agent — gerado em ' + GetDateTimeString('yyyy-mm-dd hh:nn:ss', '-', ':'));
      lines.Add('EDGE_AGENT_ID=$AgentId');
      lines.Add('EDGE_AGENT_CLINIC_ID=$ClinicId');
      lines.Add('EDGE_AGENT_API_KEY=$ApiKey');
      lines.Add('CLOUD_API_URL=$CloudApiUrl');
      lines.Add('AGENT_HTTP_PORT=3002');
      lines.Add('DICOM_AE_TITLE=$AeTitle');
      lines.Add('DICOM_PORT=$DicomPort');
      lines.Add('DICOM_ALLOWED_AE_TITLES=');
      lines.Add('STORAGE_PATH=$StoragePath');
      lines.Add('DICOM_RECEIVED_DIR=$StoragePath\received');
      lines.Add('DICOM_PROCESSED_DIR=$StoragePath\processed');
      lines.Add('DICOM_FAILED_DIR=$StoragePath\failed');
      lines.Add('HEARTBEAT_INTERVAL=15');
      lines.Add('SYNC_INTERVAL=30');
      lines.Add('MAX_CONCURRENT_UPLOADS=3');
      lines.Add('CHUNK_SIZE_MB=8');
      lines.Add('"@');
      lines.Add('Set-Content -Path "$InstallDir\.env" -Value $envContent -Encoding UTF8');
      lines.Add('');

      // Adicionar DCMTK ao PATH do sistema
      lines.Add('$dcmtkBin = "$InstallDir\dcmtk\bin"');
      lines.Add('if (Test-Path $dcmtkBin) {');
      lines.Add('    $sysPath = [Environment]::GetEnvironmentVariable("Path","Machine")');
      lines.Add('    if ($sysPath -notlike "*$dcmtkBin*") {');
      lines.Add('        [Environment]::SetEnvironmentVariable("Path","$sysPath;$dcmtkBin","Machine")');
      lines.Add('    }');
      lines.Add('}');
      lines.Add('');

      // Regra de firewall
      lines.Add('Remove-NetFirewallRule -DisplayName "SmartPACS Edge Agent - DICOM SCP" -ErrorAction SilentlyContinue');
      lines.Add('New-NetFirewallRule -DisplayName "SmartPACS Edge Agent - DICOM SCP" `');
      lines.Add('    -Direction Inbound -Protocol TCP -LocalPort $DicomPort -Action Allow | Out-Null');
      lines.Add('');

      // Servico Windows
      lines.Add('if ($InstallSvc) {');
      lines.Add('    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue');
      lines.Add('    if ($svc) { & $NssmExe stop $ServiceName 2>$null; Start-Sleep 3; & $NssmExe remove $ServiceName confirm 2>$null }');
      lines.Add('');
      lines.Add('    & $NssmExe install    $ServiceName $NodeExe "$InstallDir\dist\main.js" | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName AppDirectory      $InstallDir | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName AppStdout         "$StoragePath\logs\agent.log" | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName AppStderr         "$StoragePath\logs\agent-error.log" | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName AppRotateFiles    1 | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName AppRotateOnline   1 | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName AppRotateBytes    10485760 | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName Start             SERVICE_AUTO_START | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName DisplayName       "SmartPACS Edge Agent" | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName Description       "Receptor DICOM e agente de sincronizacao SmartPACS" | Out-Null');
      lines.Add('    & $NssmExe set        $ServiceName ObjectName        LocalSystem | Out-Null');
      lines.Add('    & $NssmExe start      $ServiceName | Out-Null');
      lines.Add('}');

      scriptPath := ExpandConstant('{app}') + '\installer-postinstall.ps1';
      lines.SaveToFile(scriptPath);
    finally
      lines.Free;
    end;
  end;
end;

// ---------------------------------------------------------------------------
// Garantir que o servico seja parado antes de atualizar
// ---------------------------------------------------------------------------
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  svcName : String;
begin
  svcName := 'SmartPACSAgent';
  if CheckForMutexes('{#AppMutex}') then begin
    Result := 'Outra instalacao do SmartPACS Edge Agent esta em andamento.';
    Exit;
  end;
  // Parar servico existente se houver
  if IsServiceInstalled(svcName) then begin
    StopService(svcName);
    Sleep(3000);
  end;
  Result := '';
end;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function IsServiceInstalled(SvcName: String): Boolean;
var
  resultCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\sc.exe'), 'query ' + SvcName,
                 '', SW_HIDE, ewWaitUntilTerminated, resultCode) and (resultCode = 0);
end;

function StopService(SvcName: String): Boolean;
var
  resultCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\sc.exe'), 'stop ' + SvcName,
                 '', SW_HIDE, ewWaitUntilTerminated, resultCode);
end;
