import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileKind, TextSource } from '../shared/types';

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.opus', '.webm', '.aac', '.flac', '.mp4', '.mov', '.mkv'];
const TEXT_EXT = ['.txt', '.md', '.markdown', '.srt', '.vtt', '.csv', '.json', '.tex', '.html'];

/** Decide o tipo pelo nome e pelo mime. Retorna null para formatos que a ferramenta não sabe ler. */
export function detectKind(name: string, mime: string): FileKind | null {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (ext === '.pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === '.docx') return 'doc';
  if (AUDIO_EXT.includes(ext) || mime.startsWith('audio/') || mime.startsWith('video/')) return 'audio';
  if (TEXT_EXT.includes(ext) || mime.startsWith('text/')) return 'text';
  return null;
}

export function unsupportedReason(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.heic' || ext === '.heif') return 'fotos HEIC não são suportadas: exporte como JPG ou PNG';
  if (ext === '.doc') return 'Word antigo (.doc) não é suportado: salve como .docx ou PDF';
  if (ext === '.pptx' || ext === '.ppt') return 'apresentações não são suportadas ainda: exporte como PDF';
  return `formato ${ext || 'desconhecido'} não é suportado`;
}

/** Legendas .srt/.vtt viram texto corrido: numeração e timestamps só atrapalham a IA. */
function cleanSubtitles(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter((l) => !/^\d+$/.test(l.trim()) && !/-->/.test(l) && l.trim() !== 'WEBVTT')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractText(
  absPath: string,
  kind: FileKind,
): Promise<{ text?: string; textSource?: TextSource; pages?: number }> {
  if (kind === 'text') {
    let raw = (await fs.readFile(absPath, 'utf8')).replace(/^﻿/, '');
    if (/\.(srt|vtt)$/i.test(absPath)) raw = cleanSubtitles(raw);
    return { text: raw, textSource: 'arquivo' };
  }
  if (kind === 'pdf') {
    const { getDocumentProxy, extractText: pdfText } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(await fs.readFile(absPath)));
    const { totalPages, text } = await pdfText(pdf, { mergePages: false });
    await pdf.loadingTask.destroy();
    const joined = text
      .map((t, i) => `--- Página ${i + 1} ---\n${t.trim()}`)
      .join('\n\n')
      .trim();
    // PDF escaneado (só imagem) não tem camada de texto: deixamos vazio para a interface avisar.
    const meaningful = text.join('').replace(/\s/g, '').length > 20 * totalPages;
    return meaningful ? { text: joined, textSource: 'pdf', pages: totalPages } : { pages: totalPages };
  }
  if (kind === 'doc') {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ path: absPath });
    return { text: value.trim(), textSource: 'docx' };
  }
  return {};
}
