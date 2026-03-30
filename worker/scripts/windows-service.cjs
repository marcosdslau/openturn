'use strict';

/**
 * Registo de Serviço Windows (node-windows) — 3 instâncias BullMQ.
 *
 * Nomes: worker_<n>_<NODE_ENV> (NODE_ENV no .env: PRD ou DEV).
 *
 * Uso (após `npm run build`, na pasta worker, CMD/PowerShell como Administrador):
 *   npm run service:install
 *   npm run service:uninstall
 *
 * Node: por omissão C:\nvm\v24.13.0\node.exe; noutra máquina use set NODE_EXE=C:\caminho\node.exe
 * Redis/DB devem ser acessíveis pela conta do serviço.
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
const nodeEnv = nodeEnvRaw.toUpperCase();
if (nodeEnv !== 'PRD' && nodeEnv !== 'DEV') {
  console.error(`NODE_ENV em .env deve ser PRD ou DEV (obtido: "${nodeEnvRaw || '(vazio)'}").`);
  process.exit(1);
}

const execPath = process.env.NODE_EXE
  ? path.resolve(process.env.NODE_EXE)
  : path.resolve(DEFAULT_NODE);

const WORKER_INSTANCES = 3;

function workerName(n) {
  return `SG_worker_${n}_${nodeEnv}`;
}

function workerConfig(n) {
  return {
    name: workerName(n),
    description: `OpenTurn Worker (instância ${n}, ${nodeEnv})`,
    script: path.join(root, 'dist', 'main.js'),
    workingDirectory: root,
    execPath,
    env: [{ name: 'NODE_ENV', value: nodeEnv }],
  };
}

function installChain(index) {
  if (index > WORKER_INSTANCES) {
    console.log('Três serviços de worker instalados e iniciados.');
    return;
  }
  const svc = new Service(workerConfig(index));
  svc.on('install', () => {
    console.log(`Serviço ${workerName(index)} instalado.`);
    svc.start();
  });
  svc.on('start', () => {
    installChain(index + 1);
  });
  svc.on('alreadyinstalled', () => {
    console.error(`Serviço ${workerName(index)} já instalado.`);
    process.exit(1);
  });
  svc.on('error', (e) => {
    console.error(e);
    process.exit(1);
  });
  svc.install();
}

function uninstallChain(index) {
  if (index > WORKER_INSTANCES) {
    console.log('Três serviços de worker removidos.');
    return;
  }
  const svc = new Service(workerConfig(index));
  svc.on('uninstall', () => {
    console.log(`Serviço ${workerName(index)} removido.`);
    uninstallChain(index + 1);
  });
  svc.on('error', (e) => {
    console.error(e);
    process.exit(1);
  });
  svc.uninstall();
}

if (cmd === 'install') {
  installChain(1);
} else if (cmd === 'uninstall') {
  uninstallChain(1);
} else {
  console.error('Uso: node scripts/windows-service.cjs install|uninstall');
  process.exit(1);
}
