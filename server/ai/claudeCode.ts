import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { DATA_DIR, UPLOAD_DIR, db, filePath } from '../store';
import { CLAUDE_FILE_RULE, kindLabel } from '../prompts';
import { ProviderError, type Part, type Provider, type RunOptions, type Turn } from './types';

const BIN = process.env.CLAUDE_BIN || 'claude';

// Imagens e PDFs vão como caminho: o Claude Code os lê com a ferramenta Read e enxerga
// fórmulas, figuras e páginas escaneadas melhor do que qualquer extração de texto.
// O resto (texto, .docx, transcrições) vai inline para economizar uma ida e volta.
function renderPart(p: Part, warn: (t: string) => void): string {
  if (p.type === 'text') return p.text;
  const f = p.file;
  const name = f.name.replace(/"/g, "'");
  if (f.kind === 'image' || f.kind === 'pdf') {
    return `<arquivo nome="${name}" tipo="${kindLabel(f)}" caminho="${filePath(f)}" />\n`;
  }
  if (!f.text) {
    warn(`"${f.name}" não tem texto (${f.kind === 'audio' ? 'transcreva o áudio primeiro' : 'arquivo vazio'}) e foi ignorado.`);
    return `<arquivo nome="${name}" tipo="${kindLabel(f)}">(sem conteúdo disponível)</arquivo>\n`;
  }
  return `<arquivo nome="${name}" tipo="${kindLabel(f)}">\n${f.text}\n</arquivo>\n`;
}

const renderTurn = (t: Turn, warn: (t: string) => void) => t.parts.map((p) => renderPart(p, warn)).join('');

/** Claude Code recebe um único prompt; num histórico sem sessão, a conversa vira uma transcrição. */
function buildPrompt(turns: Turn[], resume: boolean, warn: (t: string) => void): string {
  if (resume || turns.length === 1) return renderTurn(turns.at(-1)!, warn);
  const history = turns
    .slice(0, -1)
    .map((t) => `**${t.role === 'user' ? 'Pessoa' : 'Você (assistente)'}:**\n${renderTurn(t, warn)}`)
    .join('\n\n');
  return `## Conversa até aqui\n${history}\n\n## Nova mensagem da pessoa\n${renderTurn(turns.at(-1)!, warn)}`;
}

export function claudeCodeVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(BIN, ['--version'], { timeout: 15000 }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim())));
  });
}

export const claudeCode: Provider = {
  label: () => `Claude Code${db.settings.claude.model ? ` · ${db.settings.claude.model}` : ''}`,

  run({ system, turns, signal, emit, session }: RunOptions) {
    const warn = (text: string) => emit({ type: 'warning', text });
    const prompt = buildPrompt(turns, Boolean(session?.resume), warn);
    const { model, effort } = db.settings.claude;

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      // Só leitura de arquivos: sem Bash, sem escrita, sem web. Leituras fora de data/ pedem
      // permissão, e --permission-prompts none nega automaticamente.
      '--tools', 'Read',
      '--permission-prompts', 'none',
      // Sem CLAUDE.md, skills, hooks e MCP do usuário: o tutor não deve herdar a configuração de programação.
      '--safe-mode',
      '--add-dir', UPLOAD_DIR,
      '--system-prompt', system + CLAUDE_FILE_RULE,
    ];
    if (model) args.push('--model', model);
    if (effort) args.push('--effort', effort);
    if (session) args.push(session.resume ? '--resume' : '--session-id', session.id);
    else args.push('--no-session-persistence');

    return new Promise<string>((resolve, reject) => {
      const child = spawn(BIN, args, { cwd: DATA_DIR, stdio: ['pipe', 'pipe', 'pipe'] });
      const fileNames = new Map(db.files.map((f) => [filePath(f), f.name]));
      let text = '';
      let separatorPending = false;
      let stderr = '';
      let resultError: string | undefined;

      const abort = () => child.kill('SIGTERM');
      signal.addEventListener('abort', abort, { once: true });

      child.on('error', (err: NodeJS.ErrnoException) => {
        reject(
          new ProviderError(
            err.code === 'ENOENT'
              ? 'Claude Code não foi encontrado. Instale (https://claude.com/claude-code) ou defina CLAUDE_BIN com o caminho do executável.'
              : `Falha ao iniciar o Claude Code: ${err.message}`,
          ),
        );
      });
      child.stderr.on('data', (d) => (stderr += d));
      child.stdin.end(prompt);

      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.type === 'stream_event') {
          const ev = msg.event;
          // Cada nova mensagem do assistente (ex.: depois de ler um arquivo) vira um parágrafo novo.
          if (ev.type === 'message_start' && text) separatorPending = true;
          if (ev.type === 'content_block_start' && ev.content_block?.type === 'thinking') emit({ type: 'status', text: 'Pensando…' });
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            const chunk = (separatorPending ? '\n\n' : '') + ev.delta.text;
            separatorPending = false;
            text += chunk;
            emit({ type: 'delta', text: chunk });
          }
        } else if (msg.type === 'assistant') {
          for (const block of msg.message?.content ?? []) {
            if (block.type === 'tool_use' && block.input?.file_path) {
              const p = String(block.input.file_path);
              emit({ type: 'status', text: `Lendo ${fileNames.get(p) ?? path.basename(p)}…` });
            }
          }
        } else if (msg.type === 'result') {
          if (msg.is_error) resultError = String(msg.result || msg.errors?.join?.('; ') || msg.subtype);
          else if (!text && msg.result) text = String(msg.result);
        }
      });

      child.on('close', (code) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) return reject(new ProviderError('Cancelado.'));
        if (resultError) return reject(new ProviderError(`Claude Code: ${resultError}`));
        if (code !== 0 && !text) {
          const hint = /login|auth|credential/i.test(stderr) ? ' Rode `claude` no terminal e faça login.' : '';
          return reject(new ProviderError(`Claude Code saiu com código ${code}. ${stderr.trim().slice(-500)}${hint}`));
        }
        resolve(text);
      });
    });
  },
};
