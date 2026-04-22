'use strict';

/**
 * Registo de Serviço Windows (node-windows) — Next.js `next start`.
 *
 * - Nome do serviço: SG_webapp_<APP_ENV> com APP_ENV no .env: PRD ou DEV.
 * - NODE_ENV no processo do serviço: apenas development ou production (padrão Next).
 *
 * Uso (após `npm run build`, na pasta webapp, CMD/PowerShell como Administrador):
 *   npm run service:install
 *   npm run service:uninstall
 *
 * Node: por omissão C:\nvm\v24.13.0\node.exe; noutra máquina use set NODE_EXE=C:\caminho\node.exe
 *
 * Os ficheiros do daemon (WinSW) ficam em <webapp>/daemon/, não junto ao script em node_modules (nem em .next).
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
  console.error(
    `Ficheiro .env não encontrado em ${envPath}. Crie-o com APP_ENV=PRD|DEV, NODE_ENV=development|production e PORT.`,
  );
  process.exit(1);
}
dotenv.config({ path: envPath });

const appEnvRaw = (process.env.APP_ENV || '').trim();
const appEnv = appEnvRaw.toUpperCase();
if (appEnv !== 'PRD' && appEnv !== 'DEV') {
  console.error(`APP_ENV em .env deve ser PRD ou DEV (obtido: "${appEnvRaw || '(vazio)'}").`);
  process.exit(1);
}

const nodeEnvRaw = (process.env.NODE_ENV || '').trim().toLowerCase();
if (nodeEnvRaw !== 'development' && nodeEnvRaw !== 'production') {
  console.error(
    `NODE_ENV em .env deve ser development ou production (obtido: "${(process.env.NODE_ENV || '').trim() || '(vazio)'}").`,
  );
  process.exit(1);
}
const nodeEnv = nodeEnvRaw;

let portRaw = (process.env.PORT || '').trim();
if (!portRaw) {
  portRaw = '3001';
  console.warn('PORT ausente em .env; a usar 3001. Defina PORT em .env como porta do Next (nginx / serviço).');
}
const port = parseInt(portRaw, 10);
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`PORT em .env deve ser um número entre 1 e 65535 (obtido: "${portRaw}").`);
  process.exit(1);
}

const serviceName = `${appEnv}_SG_webapp`;

const execPath = process.env.NODE_EXE
  ? path.resolve(process.env.NODE_EXE)
  : path.resolve(DEFAULT_NODE);

const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!fs.existsSync(nextBin)) {
  console.error(`Next CLI não encontrado em ${nextBin}. Execute npm install na pasta webapp.`);
  process.exit(1);
}

function createService() {
  const svc = new Service({
    name: serviceName,
    description: `SG Webapp (Next.js) porta ${port}`,
    script: nextBin,
    scriptOptions: 'start',
    workingDirectory: root,
    execPath,
    env: [
      { name: 'NODE_ENV', value: nodeEnv },
      { name: 'APP_ENV', value: appEnv },
      { name: 'PORT', value: String(port) },
    ],
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
