# OpenTurn Web API 🚀

Middleware de conexão entre ERPs Educacionais e Sistemas de Controle de Acesso Físico (Catracas).

## 🛠️ Tecnologias
- **Framework:** NestJS v11
- **ORM:** Prisma
- **Banco de Dados:** PostgreSQL (com RLS)
- **Autenticação:** JWT + Passport
- **Idioma:** TypeScript

## 🚀 Como iniciar o projeto

Siga os passos abaixo para configurar o ambiente local:

```bash
# 1. Entre na pasta da API
cd webapi

# 2. Instale as dependências
npm install

# 3. Configure o banco de dados (Docker Compose deve estar rodando)
# Aplica o schema no banco de dados APENAS PARA DESENVOLVIMENTO
npx prisma db push

# 4. Popula dados de teste (Seed) — veja seção abaixo
npm run db:seed

# 5. Inicie o servidor em modo de desenvolvimento
npm run start:dev
```

## 🌱 Seed (dados iniciais)

O seed popula o banco com as **bases iniciais** do sistema — em desenvolvimento e no **primeiro deploy de produção**.

**Pré-requisitos:**
- Arquivo `.env` configurado (conexão com PostgreSQL)
- Schema aplicado no banco (`npx prisma db push` / `migrate dev` em dev, ou `migrate deploy` em produção)

**Como executar:**

```bash
cd webapi

# Opção recomendada (script npm)
npm run db:seed

# Equivalente direto via Prisma
npx prisma db seed
```

**O que é criado:**
- Cliente (Grupo SchoolGuard)
- Instituições: *Colégio SchoolGuard* e *Colégio SchoolGuard - Samples*
- Usuário SUPER_ROOT: `marcosdslau@gmail.com` (senha vazia — use **Esqueci minha senha** no primeiro acesso)
- Pessoas de exemplo na instituição Samples
- Provedor e modelos de IA (OpenAI)

O script é **idempotente**: registros já existentes são ignorados; pode rodar novamente sem duplicar dados.

---

## Em Produção, para sincronizar o banco execute:

```bash
cd webapi
npx prisma migrate deploy   # aplica migrations pendentes
npm run db:seed             # bases iniciais (primeiro deploy ou quando necessário)
```
---

## 🔐 Testando Autenticação

Após rodar o seed, defina a senha do usuário SUPER_ROOT via **Esqueci minha senha** na webapp (o seed cria o usuário sem senha).

Para obter o token JWT:

**Endpoint:** `POST http://localhost:3000/auth/login`

**Payload:**
```json
{
  "email": "marcosdslau@gmail.com",
  "senha": "<sua-senha-definida>"
}
```

### Usuário criado pelo Seed:
- **Super Root:** `marcosdslau@gmail.com` — senha definida no primeiro acesso

---

## 📄 Estrutura de Documentação
Para mais detalhes sobre a arquitetura e o planejamento, consulte a pasta `/docs` na raiz do projeto:
- `ARCHITECTURE.md`: Detalhes técnicos e diagrama.
- `SPRINTS.md`: Planejamento de desenvolvimento.
- `MODELAGEM-DADOS.dbml`: Esquema do banco de dados.

## Backup Base

````
pg_dump --host localhost --port 5432 --username postgres --format tar --file /var/lib/postgresql/data/bkp_prd_schoolguard_db_31052026.backup prd_schoolguard_db


pg_restore --host localhost --port 5432 --username postgres --dbname dev_schoolguard_db --clean --verbose /var/lib/postgresql/data/bkp_prd_schoolguard_db_31052026.backup

```