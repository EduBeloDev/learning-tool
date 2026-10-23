import fs from 'node:fs/promises';
import OpenAI from 'openai';
import type { FileRec } from '../../shared/types';
import { db, filePath, nvidiaKey, save } from '../store';
import { VISION_PROMPT, kindLabel } from '../prompts';
import { ProviderError, type Part, type Provider, type RunOptions } from './types';

// NVIDIA NIM expõe uma API compatível com OpenAI; o SDK oficial da OpenAI é o cliente documentado pela NVIDIA.

/** ~100k tokens. Acima disso avisamos em vez de cortar o material sem a pessoa saber. */
const MAX_PROMPT_CHARS = 400_000;
/** Imagens em base64 acima disso são recusadas por vários endpoints NIM. */
const MAX_INLINE_IMAGE = 180_000;

function client() {
  const apiKey = nvidiaKey();
  if (!apiKey) throw new ProviderError('Falta a chave da NVIDIA. Abra Ajustes e cole sua NVIDIA_API_KEY (build.nvidia.com).');
  return new OpenAI({ apiKey, baseURL: db.settings.nvidia.baseUrl });
}

function explain(err: unknown): ProviderError {
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401 || err.status === 403) return new ProviderError('NVIDIA recusou a chave (401/403). Confira a NVIDIA_API_KEY em Ajustes.');
    if (err.status === 404) return new ProviderError(`Modelo não encontrado na NVIDIA. Escolha outro em Ajustes. (${err.message})`);
    if (err.status === 429) return new ProviderError('Limite de uso da NVIDIA atingido (429). Espere um pouco ou troque de modelo.');
    return new ProviderError(`NVIDIA respondeu ${err.status}: ${err.message}`);
  }
  if (err instanceof Error && err.name === 'AbortError') return new ProviderError('Cancelado.');
  return new ProviderError(err instanceof Error ? err.message : String(err));
}

/** Reduz a imagem até caber no limite de envio inline. sharp é opcional: sem ele, vai o original. */
async function imageDataUrl(f: FileRec): Promise<string> {
  const original = await fs.readFile(filePath(f));
  if (original.length <= MAX_INLINE_IMAGE && /jpe?g|png/.test(f.mime)) {
    return `data:${f.mime};base64,${original.toString('base64')}`;
  }
  try {
    const sharp = (await import('sharp')).default;
    for (const [width, quality] of [[1600, 80], [1200, 70], [900, 60]] as const) {
      const buf = await sharp(original).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer();
      if (buf.length <= MAX_INLINE_IMAGE || width === 900) return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
  } catch {
    /* sem sharp: tenta com o original */
  }
  return `data:${f.mime};base64,${original.toString('base64')}`;
}

/**
 * Modelos de visão da NVIDIA aceitam poucas imagens por pedido. Por isso cada imagem é "lida" uma vez
 * pelo modelo de visão, e a leitura fica salva no arquivo (dá para revisar e corrigir na interface).
 * O raciocínio acontece depois, no modelo de texto, com todas as leituras juntas.
 */
export async function readImageWithVision(f: FileRec, signal?: AbortSignal): Promise<string> {
  try {
    const res = await client().chat.completions.create(
      {
        model: db.settings.nvidia.visionModel,
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: await imageDataUrl(f) } },
            ],
          },
        ],
      },
      { signal },
    );
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) throw new ProviderError('O modelo de visão não retornou texto.');
    f.text = text;
    f.textSource = 'visao';
    save();
    return text;
  } catch (err) {
    throw err instanceof ProviderError ? err : explain(err);
  }
}

async function renderPart(p: Part, opts: RunOptions): Promise<string> {
  if (p.type === 'text') return p.text;
  const f = p.file;
  const name = f.name.replace(/"/g, "'");
  let content = f.text;
  if (!content && f.kind === 'image') {
    opts.emit({ type: 'status', text: `Lendo a imagem ${f.name} com o modelo de visão…` });
    content = await readImageWithVision(f, opts.signal);
  }
  if (!content) {
    const why =
      f.kind === 'audio' ? 'transcreva o áudio primeiro' : f.kind === 'pdf' ? 'PDF escaneado sem texto; use o Claude Code ou envie fotos das páginas' : 'arquivo vazio';
    opts.emit({ type: 'warning', text: `"${f.name}" foi ignorado (${why}).` });
    return `<arquivo nome="${name}" tipo="${kindLabel(f)}">(sem conteúdo disponível)</arquivo>\n`;
  }
  return `<arquivo nome="${name}" tipo="${kindLabel(f)}">\n${content}\n</arquivo>\n`;
}

/** Alguns modelos (DeepSeek-R1, Qwen) pensam em voz alta entre <think>…</think>; isso vira status, não resposta. */
function thinkFilter(onText: (t: string) => void, onThinking: () => void) {
  let buf = '';
  let inside = false;
  const push = (chunk: string) => {
    buf += chunk;
    for (;;) {
      const tag = inside ? '</think>' : '<think>';
      const i = buf.indexOf(tag);
      if (i === -1) {
        // Segura o fim do buffer caso a tag esteja chegando quebrada em dois pedaços.
        const keep = Math.min(buf.length, tag.length - 1);
        const out = buf.slice(0, buf.length - keep);
        if (!inside && out) onText(out);
        buf = buf.slice(buf.length - keep);
        return;
      }
      if (!inside && i > 0) onText(buf.slice(0, i));
      if (!inside) onThinking();
      inside = !inside;
      buf = buf.slice(i + tag.length);
    }
  };
  /** Solta o que ficou retido no fim do stream. */
  const flush = () => {
    if (!inside && buf) onText(buf);
    buf = '';
  };
  return { push, flush };
}

export const nvidia: Provider = {
  label: () => `NVIDIA · ${db.settings.nvidia.textModel.split('/').pop()}`,

  async run(opts: RunOptions) {
    const { system, turns, signal, emit } = opts;
    client(); // falha cedo se não houver chave, antes de mostrar "lendo imagem…"
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: system }];
    for (const t of turns) {
      const content = (await Promise.all(t.parts.map((p) => renderPart(p, opts)))).join('');
      messages.push({ role: t.role, content });
    }
    const total = messages.reduce((n, m) => n + String(m.content).length, 0);
    if (total > MAX_PROMPT_CHARS) {
      throw new ProviderError(
        `O material tem ~${Math.round(total / 4000)}k tokens, acima do que o modelo da NVIDIA aceita. Desative alguns arquivos ou use o Claude Code.`,
      );
    }

    let text = '';
    const filter = thinkFilter(
      (t) => {
        text += t;
        emit({ type: 'delta', text: t });
      },
      () => emit({ type: 'status', text: 'Raciocinando…' }),
    );

    const attempt = async (max_tokens: number) => {
      const stream = await client().chat.completions.create(
        { model: db.settings.nvidia.textModel, messages, stream: true, max_tokens, temperature: 0.3 },
        { signal },
      );
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as { content?: string | null; reasoning_content?: string } | undefined;
        if (delta?.reasoning_content && !text) emit({ type: 'status', text: 'Raciocinando…' });
        if (delta?.content) filter.push(delta.content);
      }
      filter.flush();
    };

    try {
      await attempt(8192);
    } catch (err) {
      // Vários modelos NIM limitam a saída em 4096 tokens e recusam pedidos acima disso.
      if (!text && err instanceof OpenAI.BadRequestError && /max_tokens|maximum/i.test(err.message)) await attempt(4096).catch((e) => Promise.reject(explain(e)));
      else throw explain(err);
    }
    return text;
  },
};

export async function listNvidiaModels(): Promise<string[]> {
  try {
    const page = await client().models.list();
    const ids: string[] = [];
    for await (const m of page) ids.push(m.id);
    return ids.sort();
  } catch (err) {
    throw err instanceof ProviderError ? err : explain(err);
  }
}
