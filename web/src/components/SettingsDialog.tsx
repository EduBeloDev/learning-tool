import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import type { ProviderStatus } from '../../../shared/types';
import { api } from '../api';
import { useStore } from '../store';
import { Dialog } from './Dialog';

const CLAUDE_MODELS = [
  ['', 'Padrão do seu Claude Code'],
  ['sonnet', 'Sonnet: rápido e muito bom'],
  ['opus', 'Opus: mais capaz, mais lento'],
  ['haiku', 'Haiku: o mais rápido, para tarefas simples'],
  ['fable', 'Fable: o mais capaz de todos'],
];
const EFFORTS = [
  ['', 'Padrão'],
  ['low', 'Baixo: respostas rápidas'],
  ['medium', 'Médio'],
  ['high', 'Alto: pensa mais antes de responder'],
  ['xhigh', 'Muito alto'],
];

export type Theme = 'auto' | 'light' | 'dark';

export function applyTheme(t: Theme) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem('caderno-theme', t);
  } catch {
    /* modo privado: o tema só vale nesta sessão */
  }
}

export function storedTheme(): Theme {
  try {
    return (localStorage.getItem('caderno-theme') as Theme) || 'auto';
  } catch {
    return 'auto';
  }
}

export function SettingsDialog() {
  const { state, refresh, toast, settingsOpen, setSettingsOpen } = useStore();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    if (settingsOpen) api.providers().then(setStatus);
  }, [settingsOpen, state?.settings.nvidia.hasKey]);

  if (!state) return null;
  const s = state.settings;

  const put = async (patch: unknown) => {
    try {
      await api.putSettings(patch);
      await refresh();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      setModels(await api.nvidiaModels());
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Ajustes">
      <div className="stack settings">
        <section>
          <h3>IA usada nas respostas</h3>
          <div className="choices two">
            <label className={`choice ${s.provider === 'claude-code' ? 'active' : ''}`}>
              <input type="radio" name="provider" checked={s.provider === 'claude-code'} onChange={() => put({ provider: 'claude-code' })} />
              <strong>Claude Code</strong>
              <span className="small">
                {!status ? (
                  <LoaderCircle size={13} className="spin" />
                ) : status.claudeCode.available ? (
                  <span className="ok-text">
                    <CheckCircle2 size={13} /> {status.claudeCode.version}
                  </span>
                ) : (
                  <span className="warn-text">
                    <CircleAlert size={13} /> não encontrado
                  </span>
                )}
              </span>
            </label>
            <label className={`choice ${s.provider === 'nvidia' ? 'active' : ''}`}>
              <input type="radio" name="provider" checked={s.provider === 'nvidia'} onChange={() => put({ provider: 'nvidia' })} />
              <strong>NVIDIA NIM</strong>
              <span className="small">
                {s.nvidia.hasKey ? (
                  <span className="ok-text">
                    <CheckCircle2 size={13} /> chave configurada
                  </span>
                ) : (
                  <span className="warn-text">
                    <CircleAlert size={13} /> falta a chave
                  </span>
                )}
              </span>
            </label>
          </div>
        </section>

        <section>
          <h3>Claude Code</h3>
          <div className="grid-2">
            <label className="field">
              <span>Modelo</span>
              <select className="select" value={s.claude.model} onChange={(e) => put({ claude: { model: e.target.value } })}>
                {CLAUDE_MODELS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Esforço</span>
              <select className="select" value={s.claude.effort} onChange={(e) => put({ claude: { effort: e.target.value } })}>
                {EFFORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {status && !status.claudeCode.available && (
            <p className="notice notice-warn">Não encontrei o comando <code>claude</code>. Instale o Claude Code e faça login no terminal, ou defina CLAUDE_BIN.</p>
          )}
        </section>

        <section>
          <h3>NVIDIA NIM</h3>
          {s.nvidia.keyFromEnv ? (
            <p className="notice">A chave vem da variável de ambiente NVIDIA_API_KEY.</p>
          ) : (
            <div className="row gap">
              <label className="field grow">
                <span>API key {s.nvidia.hasKey && <em className="muted">(salva; cole outra para trocar)</em>}</span>
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="nvapi-…" autoComplete="off" />
              </label>
              <button
                className="btn"
                disabled={!key.trim()}
                onClick={async () => {
                  await put({ nvidia: { apiKey: key } });
                  setKey('');
                  toast('Chave salva.', 'ok');
                }}
              >
                Salvar
              </button>
              {s.nvidia.hasKey && (
                <button className="btn btn-ghost" onClick={() => put({ nvidia: { apiKey: null } })}>
                  Remover
                </button>
              )}
            </div>
          )}
          <div className="grid-2">
            <label className="field">
              <span>Modelo de texto</span>
              <input list="nv-models" defaultValue={s.nvidia.textModel} onBlur={(e) => e.target.value.trim() && put({ nvidia: { textModel: e.target.value.trim() } })} />
            </label>
            <label className="field">
              <span>Modelo de visão (lê imagens)</span>
              <input list="nv-models" defaultValue={s.nvidia.visionModel} onBlur={(e) => e.target.value.trim() && put({ nvidia: { visionModel: e.target.value.trim() } })} />
            </label>
          </div>
          <datalist id="nv-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="row gap">
            <button className="btn btn-ghost btn-sm" onClick={loadModels} disabled={!s.nvidia.hasKey || loadingModels}>
              {loadingModels && <LoaderCircle size={14} className="spin" />} Carregar lista de modelos
            </button>
            {models.length > 0 && <span className="muted small">{models.length} modelos: digite nos campos acima para filtrar.</span>}
          </div>
          <details>
            <summary className="small">Avançado</summary>
            <label className="field">
              <span>URL da API (compatível com OpenAI)</span>
              <input defaultValue={s.nvidia.baseUrl} onBlur={(e) => e.target.value.trim() && put({ nvidia: { baseUrl: e.target.value.trim() } })} />
            </label>
          </details>
        </section>

        <section>
          <h3>Aparência</h3>
          <div className="segmented" role="radiogroup" aria-label="Tema">
            {(
              [
                ['auto', 'Automático'],
                ['light', 'Claro'],
                ['dark', 'Escuro'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                role="radio"
                aria-checked={theme === v}
                onClick={() => {
                  setTheme(v);
                  applyTheme(v);
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
