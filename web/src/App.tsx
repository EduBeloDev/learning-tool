import { useEffect } from 'react';
import { BookOpen, HelpCircle, LayoutGrid, MessageCircle, Settings, Wrench } from 'lucide-react';
import { TABS, useStore, type Tab } from './store';
import { Workspace } from './tabs/Workspace';
import { Ferramentas } from './tabs/Ferramentas';
import { Chat } from './tabs/Chat';
import { Ajuda } from './tabs/Ajuda';
import { SettingsDialog } from './components/SettingsDialog';
import { Toasts } from './components/Toasts';
import { api } from './api';

const TAB_INFO: Record<Tab, { label: string; icon: typeof BookOpen }> = {
  workspace: { label: 'Workspace', icon: LayoutGrid },
  ferramentas: { label: 'Ferramentas', icon: Wrench },
  chat: { label: 'Chat', icon: MessageCircle },
  ajuda: { label: 'Ajuda', icon: HelpCircle },
};

export function App() {
  const { state, loadError, refresh, tab, setTab, setSettingsOpen, runs } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const i = Number(e.key) - 1;
      if (TABS[i]) {
        e.preventDefault();
        setTab(TABS[i]);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [setTab]);

  const busy = Object.values(runs).filter((r) => r.running).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <BookOpen size={22} aria-hidden />
          <span>Caderno</span>
        </div>
        <nav className="tabs" role="tablist" aria-label="Seções">
          {TABS.map((t, i) => {
            const { label, icon: Icon } = TAB_INFO[t];
            return (
              <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} className="tab" onClick={() => setTab(t)} title={`${label} (Alt+${i + 1})`}>
                <Icon size={16} aria-hidden /> <span>{label}</span>
              </button>
            );
          })}
        </nav>
        <div className="topbar-right">
          {busy > 0 && <span className="busy-pill">{busy} em andamento</span>}
          {state && (
            <label className="provider-pill" title="IA usada nas respostas">
              <span>IA</span>
              <select
                value={state.settings.provider}
                onChange={async (e) => {
                  await api.putSettings({ provider: e.target.value });
                  refresh();
                }}
              >
                <option value="claude-code">Claude Code</option>
                <option value="nvidia">NVIDIA NIM</option>
              </select>
            </label>
          )}
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes" title="Ajustes">
            <Settings size={19} />
          </button>
        </div>
      </header>

      <main className="page">
        {loadError && (
          <div className="empty">
            <p className="empty-title">Não consegui falar com o servidor.</p>
            <p>
              {loadError}. Ele está rodando? Inicie com <code>npm run dev</code>.
            </p>
            <button className="btn" onClick={refresh}>
              Tentar de novo
            </button>
          </div>
        )}
        {/* Todas as abas ficam montadas: formulários e rolagem sobrevivem à troca de aba. */}
        {state &&
          TABS.map((t) => (
            <div key={t} id={`panel-${t}`} role="tabpanel" aria-labelledby={`tab-${t}`} hidden={tab !== t} className="panel">
              {t === 'workspace' && <Workspace />}
              {t === 'ferramentas' && <Ferramentas />}
              {t === 'chat' && <Chat />}
              {t === 'ajuda' && <Ajuda />}
            </div>
          ))}
      </main>

      <SettingsDialog />
      <Toasts />
    </div>
  );
}
