import type { WorkerMessage } from './whisper.worker';

const SAMPLE_RATE = 16000;

export type TranscribeProgress = { stage: 'decodificando' | 'modelo' | 'transcrevendo'; progress?: number };

let worker: Worker | null = null;
let nextId = 1;

function getWorker() {
  worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** Decodifica qualquer áudio/vídeo que o navegador entenda e devolve mono a 16 kHz (o que o Whisper espera). */
async function decodeAudio(url: string): Promise<Float32Array> {
  const data = await (await fetch(url)).arrayBuffer();
  let buffer: AudioBuffer;
  try {
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    buffer = await ctx.decodeAudioData(data);
    await ctx.close();
  } catch {
    // Navegadores que não aceitam 16 kHz no AudioContext: decodifica no padrão e reamostra offline.
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(data);
    await ctx.close();
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    buffer = await offline.startRendering();
  }
  // Cópia: o buffer interno do AudioBuffer não pode ser transferido para o worker.
  if (buffer.numberOfChannels === 1) return new Float32Array(buffer.getChannelData(0));
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buffer.numberOfChannels;
  }
  return mono;
}

export async function transcribe(
  url: string,
  opts: { model: string; language: string },
  onProgress: (p: TranscribeProgress) => void,
): Promise<string> {
  onProgress({ stage: 'decodificando' });
  const audio = await decodeAudio(url);
  const id = nextId++;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === 'progress') onProgress({ stage: m.stage, progress: m.progress });
      else {
        w.removeEventListener('message', onMessage);
        if (m.type === 'done') resolve(m.text);
        else reject(new Error(m.message));
      }
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, audio, ...opts }, [audio.buffer]);
  });
}
