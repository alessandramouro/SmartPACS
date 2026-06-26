# Setup — Ambiente de Desenvolvimento Local

## Pré-requisitos

| Ferramenta | Versão mínima | Observação |
|-----------|---------------|------------|
| Node.js | 20.x LTS | Usar nvm: `nvm use 20` |
| npm | 10.x | Vem com Node.js 20 |
| Docker | 24.x | Docker Desktop para Windows/Mac |
| Git | 2.x | |
| VS Code | Qualquer | Recomendado |

### Extensões VS Code recomendadas

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "ms-azuretools.vscode-docker",
    "prisma.prisma",
    "bradlc.vscode-tailwindcss",
    "dbaeumer.vscode-eslint"
  ]
}
```

---

## Passo a Passo

### 1. Clonar repositório

```bash
git clone https://github.com/your-org/smartpacs.git
cd smartpacs
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` e defina:
- `JWT_SECRET` — string aleatória min. 32 chars
- `JWT_REFRESH_SECRET` — string aleatória min. 32 chars  
- `ENCRYPTION_KEY` — exatamente 32 chars
- `ENCRYPTION_IV` — exatamente 16 chars

Gerar valores seguros:
```bash
# Linux/Mac
openssl rand -hex 32  # Para JWT secrets
openssl rand -hex 16  # Para ENCRYPTION_IV

# Windows PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

### 3. Instalar dependências

```bash
npm install
```

### 4. Iniciar banco de dados

```bash
docker compose up -d postgres redis
```

Aguardar ~10 segundos e verificar:
```bash
docker compose ps
# postgres e redis devem estar "healthy"
```

### 5. Migrations e seed

```bash
cd apps/api
npx prisma migrate dev --name init
npm run db:seed
cd ../..
```

### 6. Iniciar serviços

```bash
# Tudo de uma vez (recomendado)
npm run dev

# Ou separado para debugging:
# Terminal 1
npm run dev --filter=@smartpacs/api

# Terminal 2
npm run dev --filter=@smartpacs/web

# Terminal 3 (opcional — edge agent)
npm run dev --filter=@smartpacs/edge-agent
```

### 7. Verificar

Abrir no browser:
- http://localhost:3000 — Frontend
- http://localhost:3001/docs — Swagger
- http://localhost:3001/health — Health check

Login: `admin@smartpacs.com` / `Admin@123456!`

---

## Troubleshooting

### Porta 5432 ocupada
```bash
# Verificar o que usa a porta
netstat -an | grep 5432
# Parar PostgreSQL local se estiver rodando
sudo service postgresql stop  # Linux
```

### Migrations falham
```bash
cd apps/api
npx prisma db push --force-reset  # ⚠️ Destroi dados!
npm run db:seed
```

### Erro de importação de módulos
```bash
# Recompilar pacotes compartilhados
cd packages/types && npm run build
```

### Edge agent: porta 104 requer root
```bash
# Use porta alternativa em desenvolvimento
DICOM_SCP_PORT=11112 npm run dev --filter=@smartpacs/edge-agent
```

---

## Dados de Desenvolvimento

O seed cria:
- 1 super tenant (platform)
- 1 tenant demo (clinica-demo)
- 1 clínica demo
- 2 usuários (super admin + clinic admin)
- 1 edge agent demo (offline)
- 1 storage destination (Google Drive, não configurado)

Para criar mais dados de teste:
```bash
cd apps/api && npm run db:seed
```

---

## Observabilidade (opcional)

```bash
docker compose up -d prometheus grafana

# Grafana: http://localhost:3003
# Login: admin / smartpacs
```
