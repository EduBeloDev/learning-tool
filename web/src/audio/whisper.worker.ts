/// <reference lib="webworker" />
import { pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from '@huggingface/transformers';

// Roda fora da thread principal: a transcrição pesa e travaria a interface.

type Incoming = { id: number; audio: Float32Array; model: string; language: string };
export type WorkerMessage =
  | { id: number; type: 'progress'; stage: 'modelo' | 'transcrevendo'; progress: number }
  | { id: number; type: 'done'; text: string }
  | { id: number; type: 'error'; message: string };

const SAMPLE_RATE = 16000;
const SEGMENT_S = 120;

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let loadedModel = '';

const post = (m: WorkerMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

async function load(id: number, model: string) {
  if (transcriber && loadedModel === model) return transcriber;
  // progress_total já soma todos os arquivos do modelo (encoder, decoder, tokenizer…).
  const progress_callback = (p: ProgressInfo) => {
    if (p.status === 'progress_total') post({ id, type: 'progress', stage: 'modelo', progress: p.progress / 100 });
  };
  const gpu = (navigator as any).gpu ? await (navigator as any).gpu.requestAdapter().catch(() => null) : null;
  const create = (device: 'webgpu' | 'wasm') =>
    pipeline('automatic-speech-recognition', model, {
      device,
      // WebGPU: encoder em fp32 (qualidade) e decoder em q4 (velocidade). WASM: q8 em tudo.
      dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
      progress_callback,
    }) as Promise<AutomaticSpeechRecognitionPipeline>;
  try {
    transcriber = await create(gpu ? 'webgpu' : 'wasm');
  } catch (err) {
    if (!gpu) throw err;
    transcriber = await create('wasm');
  }
  loadedModel = model;
  return transcriber;
}

/**
 * Divide o áudio em blocos de ~2 min cortando no trecho mais silencioso perto da borda,
 * para não partir palavras ao meio, e assim conseguimos mostrar progresso real.
 */
function segments(audio: Float32Array): Float32Array[] {
  const out: Float32Array[] = [];
  const target = SEGMENT_S * SAMPLE_RATE;
  const search = 3 * SAMPLE_RATE;
  const frame = SAMPLE_RATE / 10;
  let start = 0;
  while (audio.length - start > target + search) {
    let best = start + target;
    let bestEnergy = Infinity;
    for (let pos = start + target - search; pos < start + target + search; pos += frame) {
      let e = 0;
      for (let i = pos; i < pos + frame; i++) e += audio[i] * audio[i];
      if (e < bestEnergy) {
        bestEnergy = e;
        best = pos + frame / 2;
      }
    }
    out.push(audio.subarray(start, best));
    start = best;
  }
  out.push(audio.subarray(start));
  return out;
}

self.onmessage = async (e: MessageEvent<Incoming>) => {
  const { id, audio, model, language } = e.data;
  try {
    const t = await load(id, model);
    const parts = segments(audio);
    const texts: string[] = [];
    post({ id, type: 'progress', stage: 'transcrevendo', progress: 0 });
    for (let i = 0; i < parts.length; i++) {
      const out = (await t(parts[i], { chunk_length_s: 30, stride_length_s: 5, language, task: 'transcribe' })) as { text: string };
      texts.push(out.text.trim());
      post({ id, type: 'progress', stage: 'transcrevendo', progress: (i + 1) / parts.length });
    }
    post({ id, type: 'done', text: texts.join(' ').replace(/\s+/g, ' ').trim() });
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
