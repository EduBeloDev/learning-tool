# Caderno

Caderno de estudos com IA, rodando na sua máquina. Você envia PDFs, fotos, áudios, documentos e transcrições; liga esses arquivos a perguntas e textos; e a IA resume, resolve exercícios, interpreta problemas, preenche documentos e conversa com você sobre cada um.

## Licença

O Caderno usa a [Licença Caderno — Uso e Compartilhamento Gratuito](LICENSE), uma licença personalizada de código disponível (*source-available*).

- **Pode:** usar e modificar a ferramenta, produzir e vender conteúdo com ela, prestar serviços que entreguem resultados e monetizar perfis de TikTok, YouTube e outras plataformas.
- **Não pode:** vender a ferramenta ou versões modificadas, nem cobrar pelo acesso ou uso, inclusive por assinatura, API, SaaS ou inclusão em pacotes pagos.
- **Ao compartilhar ou oferecer a ferramenta pela internet:** mantenha o acesso gratuito, publique o código fonte correspondente e preserve a mesma licença e a atribuição. Modificações exclusivamente privadas não precisam ser publicadas.
- **Seus materiais e resultados:** não precisam ser publicados nem distribuídos gratuitamente. Direitos de terceiros e termos dos provedores de IA continuam aplicáveis.

Este resumo não substitui o [texto completo da licença](LICENSE). Por restringir a venda da ferramenta, esta não é uma licença open source segundo a definição da OSI.

## Rodar

Requisitos: Node 22+ e pelo menos uma IA configurada (veja abaixo).

```bash
npm install
npm run dev          # abre em http://localhost:5173
```

Para usar no dia a dia sem o modo de desenvolvimento:

```bash
npm run build
npm start            # abre em http://localhost:5174
```

## Rodar em outra máquina

Funciona em Linux, macOS e Windows.

1. Instale o **Node 22 ou mais novo** ([nodejs.org](https://nodejs.org/) ou `nvm install`, que lê o `.nvmrc`) e o **git**.
2. Clone e instale as dependências:
   ```bash
   git clone https://github.com/EduBeloDev/learning-tool.git
   cd learning-tool
   npm install
   ```
3. Configure pelo menos uma IA:
   - **Claude Code:** instale ([claude.com/claude-code](https://claude.com/claude-code)) e rode `claude` uma vez no terminal para fazer login.
   - **NVIDIA:** cole a chave em **Ajustes** dentro do app.
4. Rode `npm run dev` e abra http://localhost:5173.

> Seus arquivos, cartões, conversas e a chave da NVIDIA ficam em `data/`, que **não vai para o GitHub** (está no `.gitignore`). A máquina nova começa vazia. Para levar tudo junto, copie a pasta `data/` inteira de uma máquina para a outra (pendrive, Drive etc.), com o app fechado.

## Configurar a IA

O seletor **IA** no topo troca entre as duas a qualquer momento.

| | Claude Code | NVIDIA NIM |
|---|---|---|
| Como configurar | Ter o `claude` instalado e logado (`claude` no terminal, uma vez) | Gerar uma chave em [build.nvidia.com](https://build.nvidia.com) e colar em **Ajustes** (ou `NVIDIA_API_KEY=nvapi-… npm run dev`) |
| PDF | Lê o original, inclusive fórmulas, figuras e páginas escaneadas | Só o texto extraído |
| Imagens | Vê direto | Um modelo de visão “lê” cada imagem uma vez; a leitura fica salva e pode ser corrigida |
| Custo | Sua assinatura do Claude | Créditos da NVIDIA |

O Claude Code roda em modo restrito: só a ferramenta de **leitura** fica disponível, e só para os arquivos enviados. Ele não executa comandos, não escreve arquivos, não acessa a internet e não carrega seu `CLAUDE.md`, skills ou MCPs.

Variáveis opcionais: `PORT` (API, padrão 5174), `CADERNO_DATA` (pasta de dados, padrão `./data`), `CLAUDE_BIN` (caminho do `claude`).

## Como funciona

- **Matérias e aulas**: cada matéria é uma aba no topo e filtra Workspace, Ferramentas e Chat. Dentro dela, as fontes ficam em pastas de aula (Aula 1 a Aula 10, número ajustável). Um cartão pode usar arquivos de várias aulas.
- **Workspace**: fontes (arquivos) à esquerda e cartões (pergunta, texto ou geral) à direita. Cada vínculo arquivo↔cartão pode ser ativado ou desativado com um clique (marca-texto amarelo = ativo). O interruptor de cada fonte a desliga em todo o app.
- **Ferramentas**: fluxos guiados para Resumir, Resolver exercícios, Interpretar problema, Preencher documento e Transcrever áudio.
- **Chat**: conversa com contexto escolhido (cartões e arquivos). Com o Claude Code, a sessão é retomada enquanto o contexto não muda.
- **Ajuda**: guia completo dentro do app.

O áudio é transcrito **no navegador** com Whisper (transformers.js): o áudio não sai do computador. O modelo (40 a 250 MB) é baixado do Hugging Face na primeira vez.

## Estrutura

```
shared/types.ts       Contrato servidor↔interface. Mudou um dado salvo? Começa aqui.
server/
  index.ts            Sobe o Express (só localhost) e serve o build em produção.
  store.ts            "Banco" = data/db.json, com escrita atômica. Única peça a trocar se virar multiusuário.
  extract.ts          Detecta o tipo do arquivo e extrai texto (PDF, .docx, .txt, legendas).
  files.ts            Upload, texto colado, edição do texto extraído, leitura de imagem pela NVIDIA.
  routes.ts           Cartões, vínculos, chats, ajustes e status das IAs.
  run.ts              Execução com streaming (SSE): cartão, ferramenta ou chat.
  prompts.ts          TODOS os textos enviados à IA. Para mudar o "jeito" das respostas, mexa aqui.
  ai/                 Um arquivo por provedor, mesma interface (ai/types.ts).
web/src/
  store.tsx           Estado global; execuções e transcrições vivem aqui para sobreviver à troca de aba.
  api.ts              Cliente da API + leitor do stream SSE.
  tabs/               Uma tela por aba.
  components/         Peças reutilizadas (chips de vínculo, prévia de arquivo, markdown com LaTeX…).
  audio/              Whisper num Web Worker; corta áudios longos em blocos nos trechos de silêncio.
  styles.css          Tokens de cor/tipografia no topo; tema claro e escuro.
data/                 Seus arquivos e o db.json (fora do git).
```

## Limitações conhecidas

- Com a NVIDIA, PDFs escaneados (só imagem) não têm texto: use o Claude Code, envie fotos das páginas ou cole o texto na prévia do arquivo.
- “Preencher documento” devolve o documento preenchido em Markdown. Ainda não preenche campos de formulários PDF nem gera .docx.
- Apresentações (.pptx), Word antigo (.doc) e fotos HEIC precisam ser convertidos antes.

## Fluxo de trabalho e commits

Estas orientações valem para contribuições manuais e para assistentes de IA.

- **Sem coautoria do Claude:** não adicionar trailers `Co-Authored-By` atribuindo commits ao Claude ou à Anthropic. Nos commits feitos por assistentes para o mantenedor, usar a identidade Git de `EduBeloDev`, com o e-mail `95192286+EduBeloDev@users.noreply.github.com`.
- **Uma mudança coerente por commit:** concluir uma pequena etapa, verificar seu funcionamento e commitar antes de começar a próxima. Uma função completa, uma correção ou uma parte funcional de um módulo são bons recortes. Não é necessário esperar terminar o módulo inteiro.
- **Manter cada commit utilizável:** incluir juntos os tipos, chamadas, testes e demais ajustes necessários àquela mudança, mesmo que estejam em arquivos diferentes. Não separar por função ou arquivo se isso deixar o projeto quebrado no meio do histórico.
- **Evitar acúmulo:** não reunir funcionalidades independentes, refatorações e formatação em um único commit com milhares de linhas. Preferir dezenas ou poucas centenas de linhas quando possível, sem um limite artificial. Arquivos gerados e lockfiles podem aumentar o diff e devem acompanhar a mudança que os exige.
- **Revisar antes de registrar:** conferir `git diff` e `git diff --cached`, selecionar somente os arquivos ou trechos da etapa (`git add <arquivo>` ou `git add -p`) e executar as verificações adequadas. Preservar alterações preexistentes de outras tarefas, inclusive as já preparadas no stage.
- **Descrever o resultado:** usar mensagens curtas que expliquem o que mudou. Cada commit deve ser fácil de revisar e, quando necessário, reverter sem desfazer trabalho sem relação com ele.

Por exemplo, para adicionar exportação de documentos: primeiro implementar e verificar a conversão; depois integrar a rota da API; depois adicionar a ação na interface. Cada etapa vira um commit quando estiver consistente, com as verificações e a documentação pertinentes. Se duas partes só funcionarem juntas, entram no mesmo commit.

Commits pequenos facilitam localizar falhas e recuperar mudanças. Para manter uma cópia remota do trabalho, publicar os commits verificados na branch de trabalho; um commit apenas local não é backup no GitHub.

## Próximos passos

**Curto prazo (1–2 semanas)**
- Testar a transcrição no seu navegador e a NVIDIA com a sua chave (veja “O que foi testado”). (P)
- Exportar respostas para .docx/PDF. (M)

**Médio prazo (1–3 meses)**
- Testes automatizados da API (upload → cartão → resposta com um provedor falso). (M)
- PDF escaneado com a NVIDIA: renderizar páginas como imagem e mandar ao modelo de visão. (M)
- Preencher campos de formulários PDF de verdade. (G)

**Longo prazo (hipóteses, só se o uso crescer)**
- Flashcards com repetição espaçada a partir dos resumos.
- Sincronizar entre computadores; nesse caso o `store.ts` vira SQLite/Postgres.

## O que foi testado

- Upload e extração (PDF, imagem, texto, nome com acento), recusa de formatos não suportados.
- Cartão com Claude Code de ponta a ponta: lê PDF e imagem, respeita vínculo desativado, salva a resposta.
- Chat em dois turnos com retomada de sessão; ferramenta Resumir; erro claro sem chave da NVIDIA.
- Interface em claro, escuro e celular; LaTeX inline e em bloco.
- **Não testado aqui:** transcrição no navegador (o ambiente de desenvolvimento não acessava o Hugging Face) e chamadas reais à NVIDIA (sem chave).
