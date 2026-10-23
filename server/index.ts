import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ROOT, DATA_DIR, loadStore } from './store';
import { filesRouter } from './files';
import { apiRouter } from './routes';
import { runRouter } from './run';

const PORT = Number(process.env.PORT ?? 5174);
// Só a própria máquina acessa: os arquivos e a chave da NVIDIA não devem ficar expostos na rede.
const HOST = process.env.HOST ?? '127.0.0.1';

loadStore();

const app = express();

// Bloqueia DNS rebinding: um site malicioso que aponte o próprio domínio para 127.0.0.1
// conseguiria ler seus arquivos pela API. Só aceitamos requisições endereçadas a localhost.
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use((req, res, next) => (LOCAL_HOSTS.test(req.headers.host ?? '') ? next() : res.status(403).send('Acesso permitido só a partir de localhost.')));

app.use(express.json({ limit: '20mb' }));
app.use('/api', filesRouter, apiRouter, runRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// Em produção (npm start) o próprio servidor entrega a interface compilada.
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, HOST, () => {
  // --dev vem do "npm run dev" (flag em vez de NODE_ENV=… para funcionar também no Windows).
  const ui = process.argv.includes('--dev') ? 'http://localhost:5173' : `http://localhost:${PORT}`;
  console.log(`\n  Caderno pronto → ${ui}\n  dados em ${DATA_DIR}\n`);
});
