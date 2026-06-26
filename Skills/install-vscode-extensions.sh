#!/bin/bash
# =============================================================================
#  install-vscode-extensions.sh
#  Execute no terminal do Mac ou Linux:
#  bash install-vscode-extensions.sh
# =============================================================================

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  SmartPACS — Instalando extensões VS Code${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

extensions=(
    # ── TypeScript / Node.js / NestJS ──────────────────────────────────────
    "dbaeumer.vscode-eslint"
    "esbenp.prettier-vscode"
    "loiane.ts-extension-pack"
    "ashinzekene.nestjs"

    # ── React / Frontend ───────────────────────────────────────────────────
    "dsznajder.es7-react-js-snippets"
    "bradlc.vscode-tailwindcss"

    # ── Docker e Infraestrutura ────────────────────────────────────────────
    "ms-azuretools.vscode-docker"
    "redhat.vscode-yaml"
    "mikestead.dotenv"
    "ms-vscode-remote.remote-ssh"
    "ms-vscode-remote.remote-ssh-edit"

    # ── Banco de Dados ─────────────────────────────────────────────────────
    "ckolkman.vscode-postgres"
    "cweijan.vscode-database-client2"

    # ── Git e Produtividade ────────────────────────────────────────────────
    "eamodio.gitlens"
    "mhutchie.git-graph"
    "rangav.vscode-thunder-client"
    "humao.rest-client"

    # ── DICOM ──────────────────────────────────────────────────────────────
    "ms-dicom.dicom"

    # ── Qualidade de Código ────────────────────────────────────────────────
    "sonarsource.sonarlint-vscode"
    "usernamehw.errorlens"
    "christian-kohler.path-intellisense"

    # ── Extras úteis ──────────────────────────────────────────────────────
    "pkief.material-icon-theme"
    "zhuangtongfa.material-theme"
    "aaron-bond.better-comments"
    "wayou.vscode-todo-highlight"
    "gruntfuggly.todo-tree"
)

total=${#extensions[@]}
i=1

for ext in "${extensions[@]}"; do
    echo -e "${YELLOW}[$i/$total] Instalando $ext...${NC}"
    code --install-extension "$ext" --force > /dev/null 2>&1
    ((i++))
done

echo ""
echo -e "${GREEN}✔  Todas as extensões instaladas com sucesso!${NC}"
echo -e "${GREEN}   Reinicie o VS Code para ativar tudo.${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
