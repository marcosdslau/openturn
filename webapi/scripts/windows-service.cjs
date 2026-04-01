'use strict';

/**
 * Registo de Serviço Windows (node-windows).
 *
 * Nome do serviço: webapi_<NODE_ENV> (NODE_ENV no .env: PRD ou DEV).
 *
 * Uso (após `npm run build`, na pasta webapi, CMD/PowerShell como Administrador):
 *   npm run service:install
 *   npm run service:uninstall
 *
 * Node: por omissão C:\nvm\v24.13.0\node.exe; noutra máquina use set NODE_EXE=C:\caminho\node.exe
 *
 * Os ficheiros do daemon (WinSW) ficam em <webapi>/daemon/, não em dist/ (para não serem apagados pelo build).
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Service } = require('node-windows');

const DEFAULT_NODE = 'C:\\nvm\\v24.13.0\\node.exe';
const root = path.resolve(__dirname, '..');
const cmd = process.argv[2];

const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  console.error(`Ficheiro .env não encontrado em ${envPath}. Crie-o com NODE_ENV=PRD ou NODE_ENV=DEV.`);
  process.exit(1);
}
dotenv.config({ path: envPath });
const nodeEnvRaw = (process.env.NODE_ENV || '').trim();
const portRaw = (process.env.PORT || '').trim();
const port = parseInt(portRaw, 10);
if (isNaN(port)) {
  console.error(`PORT em .env deve ser um número (obtido: "${portRaw || '(vazio)'}").`);
  process.exit(1);
}
const portRawWs = (process.env.PORTWS || '').trim();
const portWs = parseInt(portRawWs, 10);
if (isNaN(portWs)) {
  console.error(`PORTWS em .env deve ser um número (obtido: "${portRawWs || '(vazio)'}").`);
  process.exit(1);
}
const nodeEnv = nodeEnvRaw.toUpperCase();
if (nodeEnv !== 'PRD' && nodeEnv !== 'DEV') {
  console.error(`NODE_ENV em .env deve ser PRD ou DEV (obtido: "${nodeEnvRaw || '(vazio)'}").`);
  process.exit(1);
}

const serviceName = `SG_webapi_${nodeEnv}`;

const execPath = process.env.NODE_EXE
  ? path.resolve(process.env.NODE_EXE)
  : path.resolve(DEFAULT_NODE);

function createService() {
  const svc = new Service({
    name: serviceName,
    description: `SG Web API (NestJS) (${nodeEnv}) Porta ${port} e ${portWs}`,
    script: path.join(root, 'dist', 'src', 'main.js'),
    workingDirectory: root,
    execPath,
    env: [{ name: 'NODE_ENV', value: nodeEnv }],
  });
  svc.directory(root);
  return svc;
}

if (cmd === 'install') {
  const svc = createService();
  svc.on('install', () => {
    console.log(`Serviço ${serviceName} instalado.`);
    svc.start();
  });
  svc.on('alreadyinstalled', () => {
    console.error('Serviço já instalado.');
    process.exit(1);
  });
  svc.on('error', (e) => {
    console.error(e);
    process.exit(1);
  });
  svc.install();
} else if (cmd === 'uninstall') {
  const svc = createService();
  svc.on('uninstall', () => console.log(`Serviço ${serviceName} removido.`));
  svc.on('error', (e) => {
    console.error(e);
    process.exit(1);
  });
  svc.uninstall();
} else {
  console.error('Uso: node scripts/windows-service.cjs install|uninstall');
  process.exit(1);
}
