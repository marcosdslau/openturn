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
# Aplica o schema no banco de dados
npx prisma db push

# 4. Popula dados de teste (Seed)
npx prisma db seed

# 5. Inicie o servidor em modo de desenvolvimento
npm run start:dev
```

---

## 🔐 Testando Autenticação

Para realizar o login e obter o token JWT:

**Endpoint:** `POST http://localhost:3000/auth/login`

**Payload:**
```json
{
  "email": "root@openturn.com",
  "senha": "123456"
}
```

### Credenciais de Teste (Seed):
- **Super Root:** `root@openturn.com` / `123456`
- **Gestor Alpha:** `gestor@openturn.com` / `123456`
- **Operador Alpha:** `operador@openturn.com` / `123456`

---

## 📄 Estrutura de Documentação
Para mais detalhes sobre a arquitetura e o planejamento, consulte a pasta `/docs` na raiz do projeto:
- `ARCHITECTURE.md`: Detalhes técnicos e diagrama.
- `SPRINTS.md`: Planejamento de desenvolvimento.
- `MODELAGEM-DADOS.dbml`: Esquema do banco de dados.
