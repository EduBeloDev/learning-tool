import { useStore } from '../store';

const SECTIONS = [
  ['comecar', 'Comece em 3 passos'],
  ['materias', 'Matérias e aulas'],
  ['workspace', 'Workspace e vínculos'],
  ['ferramentas', 'Ferramentas'],
  ['chat', 'Chat'],
  ['ia', 'Qual IA usar'],
  ['configurar', 'Configurar a IA'],
  ['arquivos', 'Arquivos suportados'],
  ['atalhos', 'Atalhos'],
  ['privacidade', 'Privacidade e dados'],
  ['problemas', 'Problemas comuns'],
] as const;

export function Ajuda() {
  const { setTab, setSettingsOpen } = useStore();
  return (
    <div className="help">
      <nav className="help-nav" aria-label="Seções da ajuda">
        <p className="help-nav-title">Nesta página</p>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#ajuda-${id}`} onClick={(e) => (e.preventDefault(), document.getElementById(`ajuda-${id}`)?.scrollIntoView({ behavior: 'smooth' }))}>
            {label}
          </a>
        ))}
      </nav>

      <article className="help-body">
        <section id="ajuda-comecar">
          <h2>Comece em 3 passos</h2>
          <ol className="big-steps">
            <li>
              <strong>Envie seus materiais.</strong> Em <button className="link-btn" onClick={() => setTab('workspace')}>Workspace</button>, solte PDFs, fotos da lousa ou da
              lista, áudios de aula, documentos Word ou textos na coluna <em>Fontes</em>.
            </li>
            <li>
              <strong>Crie um cartão.</strong> Escreva uma pergunta (“resolva o exercício 3”) ou cole um texto, e marque os arquivos que ele deve usar.
            </li>
            <li>
              <strong>Clique em Responder.</strong> A resposta aparece embaixo do cartão. Para tirar dúvidas sobre ela, use <em>Discutir</em>: o chat abre já com o contexto.
            </li>
          </ol>
        </section>

        <section id="ajuda-materias">
          <h2>Matérias e aulas</h2>
          <p>
            Cada matéria ganha uma aba no topo da página (<em>Cálculo I</em>, <em>Física II</em>…), e cada matéria é dividida em pastas de aula: <strong>Aula 1</strong> a{' '}
            <strong>Aula 10</strong> (o número de aulas pode ser mudado). Crie a primeira em <strong>+ Nova matéria</strong>.
          </p>
          <ul>
            <li>
              A matéria aberta vale para o <strong>Workspace</strong>, as <strong>Ferramentas</strong> e o <strong>Chat</strong> ao mesmo tempo: só aparece o que é dela, e
              tudo que você enviar ou criar já nasce nela. <strong>Todas</strong> mostra tudo junto.
            </li>
            <li>
              Nas Fontes, cada aula é uma pasta. Escolha a aula em <strong>Enviar para</strong>, solte o arquivo direto na pasta ou use o botão de envio ao lado do nome da
              pasta.
            </li>
            <li>
              Para mudar um arquivo de aula, arraste-o até outra pasta. Para mudar de matéria, arraste até outra aba, ou abra o arquivo e troque em{' '}
              <strong>Matéria e aula</strong>.
            </li>
            <li>
              Os arquivos ficam separados, mas um cartão pode usar arquivos de <strong>várias aulas</strong>: em <strong>+ arquivo</strong> a lista vem dividida por aula. Nas
              Ferramentas, dá para marcar uma aula inteira de uma vez.
            </li>
            <li>
              Excluir uma matéria (lápis ao lado das abas) não apaga nada: os arquivos, cartões e conversas dela ficam sem matéria, em <strong>Todas</strong>.
            </li>
          </ul>
        </section>

        <section id="ajuda-workspace">
          <h2>Workspace e vínculos</h2>
          <p>
            O Workspace tem duas colunas. Em <strong>Fontes</strong> ficam os arquivos. Em <strong>Cartões</strong> ficam as perguntas e os textos que precisam de resposta. Um
            arquivo pode estar ligado a vários cartões, e um cartão pode usar vários arquivos.
          </p>
          <h3>Os três tipos de cartão</h3>
          <dl className="defs">
            <dt>Pergunta</dt>
            <dd>Algo curto: “quanto vale x?”, “explique a figura 2”, “resolva o 4b”.</dd>
            <dt>Texto</dt>
            <dd>Um enunciado longo, uma redação para corrigir, um formulário para preencher, uma instrução detalhada.</dd>
            <dt>Geral</dt>
            <dd>Sem pergunta: a IA olha os arquivos, descobre o que eles pedem (exercícios, perguntas, campos) e resolve tudo. Se for só conteúdo, faz um resumo.</dd>
          </dl>
          <h3>Ligar e desligar vínculos</h3>
          <div className="legend">
            <span className="chip chip-on">
              <span className="chip-main as-label">
                <span className="chip-name">lista_3.pdf</span>
              </span>
            </span>
            <span>marca-texto amarelo = <strong>ativo</strong>: o arquivo é enviado com o cartão.</span>
          </div>
          <div className="legend">
            <span className="chip chip-off">
              <span className="chip-main as-label">
                <span className="chip-name">aula_12.m4a</span>
              </span>
            </span>
            <span>contorno tracejado = <strong>inativo</strong>: o vínculo continua, mas o arquivo não é enviado.</span>
          </div>
          <ul>
            <li>Clique no nome do arquivo dentro do cartão para alternar entre ativo e inativo. O <strong>×</strong> desfaz o vínculo.</li>
            <li>
              O <strong>interruptor</strong> ao lado de cada fonte desliga o arquivo em <em>todos</em> os cartões, nas ferramentas e no chat, sem perder os vínculos.
            </li>
            <li>Para vincular: arraste a fonte até o cartão, use <strong>+ arquivo</strong>, ou solte um arquivo do computador direto no cartão.</li>
            <li>Passe o mouse sobre uma fonte para destacar os cartões que a usam (e vice-versa).</li>
            <li>
              Clique no nome de uma fonte para ver a prévia e o <strong>texto que a IA recebe</strong>. Dá para corrigir esse texto (uma transcrição com erro, por exemplo).
            </li>
          </ul>
          <h3>Respostas</h3>
          <p>
            Cada cartão guarda o histórico de respostas. <strong>Responder de novo</strong> gera uma nova versão sem apagar as anteriores. <strong>Responder todos</strong> processa os
            cartões um por vez.
          </p>
        </section>

        <section id="ajuda-ferramentas">
          <h2>Ferramentas</h2>
          <p>Fluxos guiados para tarefas comuns. Cada ferramenta explica, na lateral, quando usar e como.</p>
          <dl className="defs">
            <dt>Resumir</dt>
            <dd>Resumo curto ou detalhado, tópicos, esquema, flashcards ou questões de revisão com gabarito.</dd>
            <dt>Resolver exercícios</dt>
            <dd>Quatro modos: resolução completa, como uma aula, só dicas (sem entregar a resposta) e conferir as suas respostas.</dd>
            <dt>Interpretar problema</dt>
            <dd>Destrincha o enunciado: dados, o que se pede, conceitos, estratégia, resolução, verificação e erros comuns.</dd>
            <dt>Preencher documento</dt>
            <dd>Preenche um formulário ou modelo com as informações das fontes. O que faltar fica marcado como [PREENCHER] e listado no final.</dd>
            <dt>Transcrever áudio</dt>
            <dd>Converte áudio e vídeo em texto no seu computador. A transcrição fica salva no arquivo.</dd>
          </dl>
          <p>
            Os resultados podem ser copiados, baixados em <code>.md</code>, salvos como uma nova fonte (para usar em outros cartões) ou levados para o chat.
          </p>
        </section>

        <section id="ajuda-chat">
          <h2>Chat</h2>
          <p>
            Uma conversa com a IA que conhece o contexto escolhido na barra de cima: <strong>cartões</strong> (com o texto, a última resposta e os arquivos ativos) e{' '}
            <strong>arquivos</strong> avulsos. Use para tirar dúvidas sobre uma resolução, pedir outra explicação ou gerar exercícios parecidos para treinar.
          </p>
          <p>
            Com o Claude Code, a conversa reaproveita a mesma sessão enquanto o contexto não muda, por isso as mensagens seguintes são mais rápidas. Se você mudar o contexto, a
            conversa é reenviada com o contexto novo.
          </p>
        </section>

        <section id="ajuda-ia">
          <h2>Qual IA usar</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Claude Code</th>
                  <th>NVIDIA NIM</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Custo</td>
                  <td>Usa a sua assinatura do Claude</td>
                  <td>Créditos gratuitos em build.nvidia.com</td>
                </tr>
                <tr>
                  <td>PDF</td>
                  <td>Lê o original, incluindo fórmulas, figuras e páginas escaneadas</td>
                  <td>Só o texto extraído (PDF escaneado não funciona)</td>
                </tr>
                <tr>
                  <td>Imagens</td>
                  <td>Vê a imagem diretamente</td>
                  <td>Um modelo de visão “lê” cada imagem uma vez e o texto é reaproveitado</td>
                </tr>
                <tr>
                  <td>Velocidade</td>
                  <td>Alguns segundos para começar a responder</td>
                  <td>Começa a responder rápido</td>
                </tr>
                <tr>
                  <td>Melhor para</td>
                  <td>Exercícios de exatas, provas escaneadas, raciocínio longo</td>
                  <td>Textos, resumos e perguntas rápidas</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>Troque a IA a qualquer momento no seletor do topo. Cada resposta registra qual IA foi usada.</p>
        </section>

        <section id="ajuda-configurar">
          <h2>Configurar a IA</h2>
          <h3>Claude Code</h3>
          <ol>
            <li>
              Instale o Claude Code e faça login uma vez no terminal: <code>claude</code>.
            </li>
            <li>
              Pronto. Em <button className="link-btn" onClick={() => setSettingsOpen(true)}>Ajustes</button>, você pode escolher o modelo (Sonnet, Opus…) e o nível de esforço.
            </li>
          </ol>
          <p className="muted">
            O Claude Code roda aqui em modo seguro: só pode <em>ler</em> os arquivos que você enviou (nada de comandos, escrita ou internet) e não carrega suas configurações de
            programação.
          </p>
          <h3>NVIDIA NIM</h3>
          <ol>
            <li>
              Acesse <a href="https://build.nvidia.com" target="_blank" rel="noreferrer">build.nvidia.com</a>, entre na sua conta e gere uma API key (começa com{' '}
              <code>nvapi-</code>).
            </li>
            <li>
              Cole a chave em <button className="link-btn" onClick={() => setSettingsOpen(true)}>Ajustes</button>, ou defina a variável <code>NVIDIA_API_KEY</code> antes de iniciar o
              app.
            </li>
            <li>Escolha um modelo de texto e um de visão. O botão “Carregar lista” mostra todos os modelos disponíveis para a sua chave.</li>
          </ol>
        </section>

        <section id="ajuda-arquivos">
          <h2>Arquivos suportados</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr>
                  <td>PDF</td>
                  <td>Texto extraído automaticamente; o Claude Code também lê PDFs escaneados.</td>
                </tr>
                <tr>
                  <td>Imagens</td>
                  <td>PNG, JPG, WEBP, GIF. Fotos de iPhone (HEIC) precisam ser exportadas como JPG. Ctrl+V cola prints direto.</td>
                </tr>
                <tr>
                  <td>Áudio e vídeo</td>
                  <td>MP3, M4A, WAV, OGG/OPUS (WhatsApp), MP4, WEBM… Precisam ser transcritos antes de ir para a IA.</td>
                </tr>
                <tr>
                  <td>Documentos</td>
                  <td>.docx (Word), .txt, .md, .csv, .tex, legendas .srt/.vtt (os horários são removidos).</td>
                </tr>
                <tr>
                  <td>Texto colado</td>
                  <td>Use “Colar texto ou transcrição” para criar uma fonte a partir de qualquer texto.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="ajuda-atalhos">
          <h2>Atalhos</h2>
          <dl className="shortcuts">
            <dt>
              <kbd>Alt</kbd> + <kbd>1</kbd>…<kbd>4</kbd>
            </dt>
            <dd>Trocar de aba</dd>
            <dt>
              <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
            </dt>
            <dd>No novo cartão: adicionar e responder. Dentro de um cartão: responder.</dd>
            <dt>
              <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd>
            </dt>
            <dd>No novo cartão: só adicionar</dd>
            <dt>
              <kbd>Ctrl</kbd> + <kbd>V</kbd>
            </dt>
            <dd>Colar imagem (print) como nova fonte</dd>
            <dt>
              <kbd>Enter</kbd> / <kbd>Shift</kbd> + <kbd>Enter</kbd>
            </dt>
            <dd>No chat: enviar / quebrar linha</dd>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>Fechar janelas e menus</dd>
          </dl>
        </section>

        <section id="ajuda-privacidade">
          <h2>Privacidade e dados</h2>
          <ul>
            <li>
              Tudo fica na pasta <code>data/</code> do projeto: os arquivos em <code>data/uploads</code> e os cartões, conversas e ajustes em <code>data/db.json</code>.
            </li>
            <li>O servidor só aceita conexões do seu próprio computador.</li>
            <li>A transcrição de áudio acontece no navegador: o áudio não sai do seu computador.</li>
            <li>
              Quando você pede uma resposta, o conteúdo dos arquivos <em>ativos</em> daquele cartão vai para a IA escolhida (Anthropic ou NVIDIA). Desative o que não quiser
              enviar.
            </li>
            <li>A chave da NVIDIA fica salva em <code>data/db.json</code> e nunca é enviada para a interface.</li>
          </ul>
        </section>

        <section id="ajuda-problemas">
          <h2>Problemas comuns</h2>
          <details>
            <summary>“Claude Code não foi encontrado”</summary>
            <p>
              O servidor não achou o comando <code>claude</code>. Confira com <code>claude --version</code> no mesmo terminal em que roda o app, ou inicie com{' '}
              <code>CLAUDE_BIN=/caminho/para/claude npm run dev</code>.
            </p>
          </details>
          <details>
            <summary>Claude Code pede login ou dá erro de autenticação</summary>
            <p>
              Rode <code>claude</code> no terminal uma vez e faça login. Depois, tente de novo.
            </p>
          </details>
          <details>
            <summary>“PDF escaneado” com a NVIDIA</summary>
            <p>O PDF é só imagem, sem texto. Use o Claude Code, envie fotos das páginas (a NVIDIA lê imagens) ou cole o texto manualmente na prévia do arquivo.</p>
          </details>
          <details>
            <summary>A transcrição está lenta</summary>
            <p>
              Sem placa de vídeo compatível com WebGPU, a transcrição roda na CPU. Use a qualidade “Rápido” para áudios longos, ou um navegador com WebGPU (Chrome/Edge
              atualizados).
            </p>
          </details>
          <details>
            <summary>A NVIDIA responde “modelo não encontrado” (404)</summary>
            <p>O catálogo da NVIDIA muda com frequência. Em Ajustes, clique em “Carregar lista” e escolha um modelo disponível.</p>
          </details>
          <details>
            <summary>A resposta ignorou um arquivo</summary>
            <p>
              Confira se o vínculo está ativo (marca-texto amarelo), se o interruptor da fonte está ligado e se o arquivo tem texto (áudios precisam ser transcritos). Os avisos
              aparecem em amarelo acima da resposta.
            </p>
          </details>
        </section>
      </article>
    </div>
  );
}
