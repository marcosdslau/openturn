FROM node:24-alpine

WORKDIR /app

# Instalar dependências globais se necessário
RUN npm install -g @nestjs/cli

COPY package*.json ./

RUN npm install

COPY . .

# O bind mount no docker-compose cuidará do hot-reload em desenolvimento
EXPOSE 3000

CMD ["npm", "run", "start:dev"]
