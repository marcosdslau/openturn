/**
 * Copia para o worker o código que tem a webapi como fonte da verdade, no mesmo espírito do
 * `prisma:sync`. Evita que tela (webapi) e rotinas (worker) divirjam — o que já aconteceu com
 * a camada de hardware, mantida à mão nos dois projetos.
 *
 *   webapi/src/turma/core/*.ts                                   → worker/src/turma/core/
 *   webapi/src/hardware/brands/controlid/access-group/*.ts       → worker/src/hardware/brands/controlid/access-group/
 *
 * Arquivos *.spec.ts não são copiados (o worker não roda jest). Arquivos que deixaram de existir
 * na origem são removidos do destino. Uso: `npm run shared:sync` (também roda no `build`).
 */
const fs = require('fs');
const path = require('path');

const raizWorker = path.resolve(__dirname, '..');
const raizWebapi = path.resolve(raizWorker, '..', 'webapi');

const PASTAS = [
  ['src/turma/core', 'src/turma/core'],
  ['src/hardware/brands/controlid/access-group', 'src/hardware/brands/controlid/access-group'],
];

const cabecalho = (origem) =>
  `// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/${origem}\n` +
  `// NÃO EDITE AQUI — altere na webapi e rode \`npm run shared:sync\` no worker.\n`;

let copiados = 0;
let removidos = 0;

for (const [de, para] of PASTAS) {
  const origem = path.join(raizWebapi, de);
  const destino = path.join(raizWorker, para);
  if (!fs.existsSync(origem)) {
    console.error(`[shared:sync] origem não encontrada: ${origem}`);
    process.exit(1);
  }
  fs.mkdirSync(destino, { recursive: true });

  const arquivos = fs.readdirSync(origem).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  for (const arquivo of arquivos) {
    const conteudo = fs.readFileSync(path.join(origem, arquivo), 'utf8');
    const saida = cabecalho(`${de}/${arquivo}`) + conteudo;
    const alvo = path.join(destino, arquivo);
    if (!fs.existsSync(alvo) || fs.readFileSync(alvo, 'utf8') !== saida) {
      fs.writeFileSync(alvo, saida);
      copiados++;
    }
  }

  for (const existente of fs.readdirSync(destino)) {
    if (existente.endsWith('.ts') && !arquivos.includes(existente)) {
      fs.unlinkSync(path.join(destino, existente));
      removidos++;
    }
  }
}

console.log(`[shared:sync] ${copiados} arquivo(s) atualizado(s), ${removidos} removido(s).`);
