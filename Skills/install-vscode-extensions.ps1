# =============================================================================
#  install-vscode-extensions.ps1
#  Execute no PowerShell do Windows:
#  .\install-vscode-extensions.ps1
# =============================================================================

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  SmartPACS — Instalando extensões VS Code" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

$extensions = @(
    # ── TypeScript / Node.js / NestJS ──────────────────────────────────────
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "loiane.ts-extension-pack",
    "ashinzekene.nestjs",

    # ── React / Frontend ───────────────────────────────────────────────────
    "dsznajder.es7-react-js-snippets",
    "bradlc.vscode-tailwindcss",

    # ── Docker e Infraestrutura ────────────────────────────────────────────
    "ms-azuretools.vscode-docker",
    "redhat.vscode-yaml",
    "mikestead.dotenv",
    "ms-vscode-remote.remote-ssh",
    "ms-vscode-remote.remote-ssh-edit",

    # ── Banco de Dados ─────────────────────────────────────────────────────
    "ckolkman.vscode-postgres",
    "cweijan.vscode-database-client2",

    # ── Git e Produtividade ────────────────────────────────────────────────
    "eamodio.gitlens",
    "mhutchie.git-graph",
    "rangav.vscode-thunder-client",
    "humao.rest-client",

    # ── DICOM ──────────────────────────────────────────────────────────────
    "ms-dicom.dicom",

    # ── Qualidade de Código ────────────────────────────────────────────────
    "sonarsource.sonarlint-vscode",
    "usernamehw.errorlens",
    "christian-kohler.path-intellisense",

    # ── Extras úteis ──────────────────────────────────────────────────────
    "pkief.material-icon-theme",
    "zhuangtongfa.material-theme",
    "aaron-bond.better-comments",
    "wayou.vscode-todo-highlight",
    "gruntfuggly.todo-tree"
)

$total = $extensions.Count
$i = 1

foreach ($ext in $extensions) {
    Write-Host "[$i/$total] Instalando $ext..." -ForegroundColor Yellow
    code --install-extension $ext --force 2>&1 | Out-Null
    $i++
}

Write-Host ""
Write-Host "✔  Todas as extensões instaladas com sucesso!" -ForegroundColor Green
Write-Host "   Reinicie o VS Code para ativar tudo." -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
