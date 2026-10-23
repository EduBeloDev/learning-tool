import { useState, type ReactNode } from 'react';
import { BookOpenText, Calculator, FilePen, Lightbulb, MessageCircle, Mic, Play, Save } from 'lucide-react';
import type { FileSummary, ToolId } from '../../../shared/types';
import { api } from '../api';
import { useStore } from '../store';
import { FileDrawer, FileIcon, FileStatus, LinkChip } from '../components/files';
import { CopyButton, DownloadButton, RunOutput } from '../components/RunOutput';

type Choice = { value: string; label: string; desc: string };

interface ToolDef {
  id: ToolId | 'transcrever';
  name: string;
  icon: typeof BookOpenText;
  short: string;
  tagline: string;
  when: string[];
  steps: string[];
  tip?: string;
}

const TOOLS: ToolDef[] = [
  {
    id: 'resumo',
    name: 'Resumir',
    short: 'Resumos, flashcards, questões',
    icon: BookOpenText,
    tagline: 'Transforma PDFs, fotos e aulas em resumo, tópicos, esquema, flashcards ou questões de revisão.',
    when: ['Antes da prova, para revisar rápido', 'Depois da aula, para organizar o conteúdo', 'Para criar material de estudo ativo (flashcards e questões)'],
    steps: ['Escolha os materiais', 'Escolha o formato', 'Opcional: diga em que focar'],
    tip: 'Flashcards e questões de revisão rendem mais que reler o resumo: eles obrigam você a lembrar.',
  },
  {
    id: 'exercicios',
    name: 'Resolver exercícios',
    short: 'Resolve, explica ou corrige',
    icon: Calculator,
    tagline: 'Encontra os exercícios nos materiais e resolve, explica, dá dicas ou corrige as suas respostas.',
    when: ['Lista de exercícios em PDF ou foto', 'Para conferir se você acertou', 'Quando travou e quer só uma dica'],
    steps: ['Escolha a lista (PDF, foto ou texto)', 'Escolha o modo de ajuda', 'Opcional: diga quais exercícios (ex.: 1 a 5, 7b)'],
    tip: 'O modo "Só dicas" ajuda a aprender de verdade. Use "Conferir" depois de tentar sozinho.',
  },
  {
    id: 'explicar',
    name: 'Interpretar problema',
    short: 'Entenda o enunciado',
    icon: Lightbulb,
    tagline: 'Destrincha um problema: o que ele diz, os dados, o que pede, a estratégia, a resolução e a verificação.',
    when: ['Enunciados longos ou confusos', 'Quando você não sabe nem por onde começar', 'Para entender o raciocínio, não só a resposta'],
    steps: ['Cole o problema ou escolha o arquivo onde ele está', 'Opcional: adicione materiais de apoio (teoria, fórmulas)', 'Gere a explicação'],
  },
  {
    id: 'preencher',
    name: 'Preencher documento',
    short: 'Formulários e relatórios',
    icon: FilePen,
    tagline: 'Preenche um formulário, modelo ou relatório usando as informações das suas fontes.',
    when: ['Formulários e fichas', 'Relatórios com estrutura fixa', 'Modelos (.docx/PDF) que precisam de dados de outros arquivos'],
    steps: ['Escolha o documento a preencher', 'Marque os arquivos que têm as informações', 'Opcional: dê instruções ou dados extras'],
    tip: 'O que não estiver nas fontes aparece como [PREENCHER: …] e é listado em "Pendências" no final.',
  },
  {
    id: 'transcrever',
    name: 'Transcrever áudio',
    short: 'Áudio → texto, no seu PC',
    icon: Mic,
    tagline: 'Converte áudios e vídeos de aula em texto, no seu computador, sem enviar o áudio para lugar nenhum.',
    when: ['Gravações de aula ou reunião', 'Áudios de WhatsApp com explicações', 'Antes de resumir ou fazer perguntas sobre um áudio'],
    steps: ['Envie o áudio em Workspace → Fontes', 'Clique em Transcrever', 'O texto fica salvo no arquivo e passa a ser usado pela IA'],
    tip: 'Na primeira vez o modelo Whisper é baixado (de 40 a 250 MB, conforme a qualidade). Depois disso, funciona offline.',
  },
];

const RESUMO_FORMATOS: Choice[] = [
  { value: 'curto', label: 'Curto', desc: 'Ideia central em ~10 linhas' },
  { value: 'detalhado', label: 'Detalhado', desc: 'Seções com conceitos, fórmulas e exemplos' },
  { value: 'topicos', label: 'Tópicos', desc: 'Bullets enxutos para revisão' },
  { value: 'esquema', label: 'Esquema', desc: 'Mapa mental em texto' },
  { value: 'flashcards', label: 'Flashcards', desc: 'Tabela frente/verso' },
  { value: 'questoes', label: 'Questões', desc: '10 questões + gabarito comentado' },
];

const EXERCICIO_MODOS: Choice[] = [
  { value: 'completo', label: 'Resolução completa', desc: 'Todos os passos e a resposta final' },
  { value: 'explicado', label: 'Como uma aula', desc: 'Conceito → estratégia → resolução → checagem' },
  { value: 'dicas', label: 'Só dicas', desc: 'Dicas progressivas, sem entregar a resposta' },
  { value: 'conferir', label: 'Conferir minhas respostas', desc: 'Você cola suas respostas e a IA corrige' },
];

export function Ferramentas() {
  const [current, setCurrent] = useState<ToolDef['id']>('resumo');
  const tool = TOOLS.find((t) => t.id === current)!;

  return (
    <div className="tools">
      <nav className="tools-nav" aria-label="Ferramentas">
        {TOOLS.map((t) => (
          <button key={t.id} className={`tools-nav-item ${t.id === current ? 'active' : ''}`} aria-current={t.id === current} onClick={() => setCurrent(t.id)}>
            <t.icon size={20} aria-hidden />
            <span>
              <strong>{t.name}</strong>
              <span className="muted small">{t.short}</span>
            </span>
          </button>
        ))}
      </nav>

      <div className="tool-panel">
        <header className="tool-head">
          <h2>
            <tool.icon size={24} aria-hidden /> {tool.name}
          </h2>
          <p>{tool.tagline}</p>
        </header>
        <div className="tool-grid">
          <div className="tool-main">{tool.id === 'transcrever' ? <Transcrever /> : <ToolForm key={tool.id} tool={tool.id} />}</div>
          <aside className="tool-guide" aria-label="Como usar">
            <h3>Como usar</h3>
            <ol>
              {tool.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <h3>Quando usar</h3>
            <ul>
              {tool.when.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {tool.tip && <p className="tip">{tool.tip}</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="step">
      <h3>
        <span className="step-n">{n}</span> {title}
      </h3>
      {children}
    </section>
  );
}

function Choices({ choices, value, onChange, name }: { choices: Choice[]; value: string; onChange: (v: string) => void; name: string }) {
  return (
    <div className="choices" role="radiogroup" aria-label={name}>
      {choices.map((c) => (
        <label key={c.value} className={`choice ${value === c.value ? 'active' : ''}`}>
          <input type="radio" name={name} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} />
          <strong>{c.label}</strong>
          <span className="muted small">{c.desc}</span>
        </label>
      ))}
    </div>
  );
}

function FileSelect({ files, selected, setSelected }: { files: FileSummary[]; selected: Set<string>; setSelected: (s: Set<string>) => void }) {
  if (!files.length) return <p className="muted">Nenhum arquivo ainda. Envie seus materiais na aba Workspace (ou cole o conteúdo no campo de texto abaixo).</p>;
  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  return (
    <div className="chips">
      {files.map((f) => (
        <LinkChip key={f.id} file={f} active={selected.has(f.id)} onToggle={() => toggle(f.id)} />
      ))}
      <button className="link-btn small" onClick={() => setSelected(new Set(selected.size === files.length ? [] : files.map((f) => f.id)))}>
        {selected.size === files.length ? 'nenhum' : 'todos'}
      </button>
    </div>
  );
}

function ToolForm({ tool }: { tool: ToolId }) {
  const { state, runs, startRun, cancelRun, refresh, toast, openChatWith } = useStore();
  const files = (state?.files ?? []).filter((f) => f.enabled);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [formato, setFormato] = useState('detalhado');
  const [modo, setModo] = useState('completo');
  const [quais, setQuais] = useState('');
  const [documento, setDocumento] = useState('');
  const runKey = `tool:${tool}`;
  const run = runs[runKey];

  const options: Record<string, string> = tool === 'resumo' ? { formato } : tool === 'exercicios' ? { modo, quais } : tool === 'preencher' ? { documento } : {};
  const fileIds = tool === 'preencher' && documento ? [...new Set([documento, ...selected])] : [...selected];

  const generate = () => startRun(runKey, { kind: 'tool', tool, fileIds, text, options });

  const toolName = TOOLS.find((t) => t.id === tool)!.name;
  const saveAsSource = async () => {
    if (!run?.text) return null;
    const f = await api.createText(`${toolName} – ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(/\//g, '-')}`, run.text);
    await refresh();
    toast(`Salvo em Fontes como "${f.name}".`, 'ok');
    return f;
  };

  const textLabel =
    tool === 'resumo'
      ? 'Foco (opcional)'
      : tool === 'exercicios'
        ? modo === 'conferir'
          ? 'Suas respostas'
          : 'Observações (opcional)'
        : tool === 'explicar'
          ? 'O problema'
          : 'Instruções e dados extras (opcional)';
  const textPlaceholder =
    tool === 'resumo'
      ? 'Ex.: foque em termodinâmica; explique como para quem está começando'
      : tool === 'exercicios'
        ? modo === 'conferir'
          ? 'Ex.:\n1) x = 3\n2) 45 m/s\n3) letra C'
          : 'Ex.: use o método da substituição'
        : tool === 'explicar'
          ? 'Cole o enunciado aqui (ou deixe vazio se ele estiver em um dos arquivos)'
          : 'Ex.: meu nome é…, a data é…, use linguagem formal';

  let n = 1;
  return (
    <div className="stack">
      {tool === 'preencher' && (
        <Step n={n++} title="Documento a preencher">
          <select value={documento} onChange={(e) => setDocumento(e.target.value)} className="select">
            <option value="">Nenhum arquivo: vou descrever o documento nas instruções</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Step>
      )}

      <Step n={n++} title={tool === 'preencher' ? 'Fontes de informação' : tool === 'explicar' ? 'Materiais (opcional)' : 'Materiais'}>
        <FileSelect files={files.filter((f) => f.id !== documento)} selected={selected} setSelected={setSelected} />
      </Step>

      {tool === 'resumo' && (
        <Step n={n++} title="Formato">
          <Choices name="Formato" choices={RESUMO_FORMATOS} value={formato} onChange={setFormato} />
        </Step>
      )}
      {tool === 'exercicios' && (
        <Step n={n++} title="Tipo de ajuda">
          <Choices name="Tipo de ajuda" choices={EXERCICIO_MODOS} value={modo} onChange={setModo} />
          <label className="field">
            <span>Quais exercícios (opcional)</span>
            <input value={quais} onChange={(e) => setQuais(e.target.value)} placeholder="Ex.: 1 a 5, 7b, 10 (vazio = todos)" />
          </label>
        </Step>
      )}

      <Step n={n++} title={textLabel}>
        <textarea rows={tool === 'explicar' || modo === 'conferir' ? 6 : 3} value={text} onChange={(e) => setText(e.target.value)} placeholder={textPlaceholder} />
      </Step>

      <div className="row gap">
        {run?.running ? (
          <button className="btn" onClick={() => cancelRun(runKey)}>
            Parar
          </button>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={generate} disabled={!fileIds.length && !text.trim()}>
            <Play size={16} /> Gerar
          </button>
        )}
        {!fileIds.length && !text.trim() && <span className="muted small">Escolha um arquivo ou escreva no campo acima.</span>}
      </div>

      {run && (
        <section className="result">
          {!run.running && run.text && (
            <div className="result-actions">
              <CopyButton text={run.text} />
              <DownloadButton text={run.text} filename={`${toolName.toLowerCase().replace(/\s+/g, '-')}.md`} />
              <button className="btn btn-ghost btn-sm" onClick={saveAsSource}>
                <Save size={15} /> Salvar como fonte
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  const f = await saveAsSource();
                  if (f) openChatWith({ fileIds: [...fileIds, f.id] }, toolName);
                }}
              >
                <MessageCircle size={15} /> Discutir no chat
              </button>
            </div>
          )}
          <RunOutput run={run} onCancel={() => cancelRun(runKey)} />
        </section>
      )}
    </div>
  );
}

const WHISPER_MODELS: Choice[] = [
  { value: 'onnx-community/whisper-tiny', label: 'Rápido', desc: '~40 MB · bom para áudio limpo' },
  { value: 'onnx-community/whisper-base', label: 'Equilibrado', desc: '~80 MB · recomendado' },
  { value: 'onnx-community/whisper-small', label: 'Preciso', desc: '~250 MB · mais lento, erra menos' },
];

function Transcrever() {
  const { state, refresh, queueTranscription, transcriptions } = useStore();
  const [drawer, setDrawer] = useState<string | null>(null);
  if (!state) return null;
  const audios = state.files.filter((f) => f.kind === 'audio');
  const pending = audios.filter((f) => !f.textChars && !transcriptions[f.id]);
  const whisper = state.settings.whisper;

  const setWhisper = async (patch: Partial<typeof whisper>) => {
    await api.putSettings({ whisper: patch });
    refresh();
  };

  return (
    <div className="stack">
      <Step n={1} title="Qualidade">
        <Choices name="Qualidade" choices={WHISPER_MODELS} value={whisper.model} onChange={(model) => setWhisper({ model })} />
        <label className="field inline">
          <span>Idioma do áudio</span>
          <select className="select" value={whisper.language} onChange={(e) => setWhisper({ language: e.target.value })}>
            <option value="portuguese">Português</option>
            <option value="english">Inglês</option>
            <option value="spanish">Espanhol</option>
            <option value="french">Francês</option>
            <option value="german">Alemão</option>
            <option value="italian">Italiano</option>
          </select>
        </label>
      </Step>

      <Step n={2} title="Áudios">
        {audios.length === 0 ? (
          <p className="muted">Nenhum áudio ou vídeo nas fontes. Envie em Workspace → Fontes (mp3, m4a, wav, ogg, mp4…).</p>
        ) : (
          <>
            {pending.length > 1 && (
              <button className="btn btn-sm" onClick={() => pending.forEach((f) => queueTranscription(f.id))}>
                <Mic size={14} /> Transcrever todos os pendentes ({pending.length})
              </button>
            )}
            <ul className="file-list">
              {audios.map((f) => (
                <li key={f.id} className="file-row">
                  <FileIcon kind={f.kind} />
                  <div className="file-main">
                    <button className="file-name" onClick={() => setDrawer(f.id)}>
                      {f.name}
                    </button>
                    <div className="file-meta">
                      <FileStatus file={f} />
                      {f.textChars > 0 && <span>· {f.textChars.toLocaleString('pt-BR')} caracteres</span>}
                    </div>
                  </div>
                  {f.textChars > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setDrawer(f.id)}>
                      Ver texto
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Step>
      <p className="muted small">
        A transcrição roda no navegador (WebGPU quando disponível, senão CPU). Você pode continuar usando o resto do app enquanto ela acontece.
      </p>
      <FileDrawer fileId={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
