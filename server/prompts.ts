import type { Card, FileRec, ToolId } from '../shared/types';
import type { Part } from './ai/types';

// Todos os textos que vão para a IA moram aqui, para ajustar o "jeito" das respostas num lugar só.

export const SYSTEM_BASE = `Você é um tutor paciente e um assistente de estudos. Ajuda a pessoa a entender conteúdos, resolver exercícios, interpretar problemas e preencher documentos a partir dos materiais que ela enviou.

Regras:
- Responda em português do Brasil, a menos que peçam outro idioma.
- Formate em Markdown. Para matemática use LaTeX: $...$ inline e $$...$$ em bloco.
- Ao resolver, mostre o raciocínio em passos numerados e destaque a resposta final em negrito.
- Baseie-se nos materiais. Se algo não estiver neles, diga isso claramente antes de usar conhecimento geral.
- Quando faltar informação para responder com segurança, diga exatamente o que falta. Não invente dados.
- Quando for útil, indique de qual arquivo (e página) veio a informação.`;

export const CLAUDE_FILE_RULE = `
Os materiais da pessoa são arquivos locais. Quando um <arquivo> tiver o atributo caminho, leia-o com a ferramenta Read antes de responder (PDFs longos: leia por intervalos de páginas). Não peça permissão para ler; apenas leia. Nunca leia arquivos que não foram listados.`;

const KIND_LABEL: Record<FileRec['kind'], string> = {
  image: 'imagem',
  pdf: 'PDF',
  audio: 'áudio (transcrição)',
  text: 'texto',
  doc: 'documento Word',
};
export const kindLabel = (f: FileRec) => KIND_LABEL[f.kind];

const text = (t: string): Part => ({ type: 'text', text: t });
const files = (list: FileRec[]): Part[] => list.map((file) => ({ type: 'file', file }));

function materials(list: FileRec[]): Part[] {
  if (list.length === 0) return [text('# Materiais\n(nenhum arquivo vinculado)\n')];
  return [text('# Materiais\n'), ...files(list)];
}

const CARD_TASK: Record<Card['type'], (body: string) => string> = {
  pergunta: (b) => `# Pergunta\n${b}`,
  texto: (b) =>
    `# Texto para trabalhar\nO texto abaixo é um enunciado, instrução ou documento que precisa de resposta. Faça o que ele pede, usando os materiais quando forem relevantes.\n\n<texto>\n${b}\n</texto>`,
  geral: (b) =>
    `# Tarefa\nAnalise os materiais. Identifique o que eles pedem (exercícios, perguntas, documentos a preencher ou conteúdo para estudar) e resolva tudo de forma completa, item por item. Se for apenas conteúdo, faça um resumo estruturado com os pontos principais.${b.trim() ? `\n\nObservação da pessoa: ${b}` : ''}`,
};

export function cardPrompt(card: Card, list: FileRec[]): Part[] {
  return [...materials(list), text(`\n${CARD_TASK[card.type](card.body)}`)];
}

// ---------- Ferramentas ----------

const RESUMO_FORMATO: Record<string, string> = {
  curto: 'um resumo curto (até ~10 linhas) com a ideia central e os pontos que mais caem em prova',
  detalhado: 'um resumo detalhado, organizado por seções com títulos, cobrindo todos os conceitos, definições, fórmulas e exemplos',
  topicos: 'tópicos hierárquicos (bullet points aninhados), bem enxutos, bons para revisão rápida',
  esquema: 'um esquema / mapa mental em texto: conceito central, ramos e relações entre as ideias (use listas aninhadas)',
  flashcards: 'flashcards no formato de tabela Markdown com colunas "Frente" e "Verso" (15 a 30 cartões, uma ideia por cartão)',
  questoes: '10 questões de revisão variadas (múltipla escolha e discursivas) e, ao final, um gabarito comentado',
};

const EXERCICIOS_MODO: Record<string, string> = {
  completo: 'Resolva cada exercício completamente, mostrando todos os passos e destacando a resposta final.',
  explicado:
    'Resolva cada exercício como uma aula: primeiro explique o conceito envolvido, depois a estratégia, depois a resolução passo a passo e, por fim, uma checagem do resultado.',
  dicas:
    'NÃO entregue a resposta final. Para cada exercício, dê dicas progressivas (dica 1 mais leve, dica 2 mais direta, dica 3 quase a resolução) para a pessoa chegar sozinha.',
  conferir:
    'A pessoa vai mandar as respostas dela. Para cada exercício, confira se está certo, aponte onde errou (se errou), explique o porquê e mostre a resolução correta.',
};

export function toolPrompt(tool: ToolId, list: FileRec[], input: string, options: Record<string, string>): Part[] {
  const extra = input.trim();
  switch (tool) {
    case 'resumo': {
      const formato = RESUMO_FORMATO[options.formato] ?? RESUMO_FORMATO.detalhado;
      return [
        ...materials(list),
        text(`\n# Tarefa\nFaça ${formato} dos materiais acima.${extra ? `\n\nFoco pedido pela pessoa: ${extra}` : ''}`),
      ];
    }
    case 'exercicios': {
      const modo = EXERCICIOS_MODO[options.modo] ?? EXERCICIOS_MODO.completo;
      const quais = options.quais?.trim() ? `Trabalhe apenas nestes exercícios: ${options.quais.trim()}.` : 'Trabalhe em todos os exercícios encontrados.';
      return [
        ...materials(list),
        text(
          `\n# Tarefa\nEncontre os exercícios nos materiais. ${quais}\n${modo}\nNumere conforme o material original e indique de onde cada um saiu.${
            extra ? `\n\n${options.modo === 'conferir' ? 'Respostas da pessoa' : 'Observações da pessoa'}:\n${extra}` : ''
          }`,
        ),
      ];
    }
    case 'explicar':
      return [
        ...materials(list),
        text(
          `\n# Problema\n${extra || '(o problema está nos materiais acima)'}\n\n# Tarefa\nInterprete e explique como resolver o problema, nesta estrutura:\n1. **Entendendo o problema**: o que está acontecendo, em linguagem simples\n2. **Dados**: o que foi dado (com unidades)\n3. **O que se pede**\n4. **Conceitos e fórmulas** que entram\n5. **Estratégia**: o plano antes das contas\n6. **Resolução** passo a passo\n7. **Verificação**: a resposta faz sentido? (unidades, ordem de grandeza, casos limite)\n8. **Erros comuns** neste tipo de problema`,
        ),
      ];
    case 'preencher': {
      const docId = options.documento;
      const doc = list.find((f) => f.id === docId);
      const fontes = list.filter((f) => f.id !== docId);
      return [
        text('# Documento a preencher\n'),
        ...(doc ? files([doc]) : [text('(o documento está descrito nas instruções abaixo)\n')]),
        text('\n# Fontes de informação\n'),
        ...(fontes.length ? files(fontes) : [text('(nenhuma; use apenas as instruções)\n')]),
        text(
          `\n# Tarefa\nPreencha o documento usando as fontes. Reproduza a estrutura original (títulos, campos, numeração) em Markdown, com os campos preenchidos.\n- Onde a informação não existir nas fontes, escreva **[PREENCHER: o que falta]**.\n- Ao final, liste em "Pendências" tudo que ficou sem preencher e de onde a pessoa pode tirar essa informação.${
            extra ? `\n\nInstruções da pessoa:\n${extra}` : ''
          }`,
        ),
      ];
    }
  }
}

// ---------- Chat ----------

export function chatContextParts(cards: Card[], cardFiles: FileRec[]): Part[] {
  const parts: Part[] = [text('# Contexto desta conversa\nA pessoa está estudando com os materiais e cartões abaixo. Use-os para entender do que ela está falando.\n')];
  for (const c of cards) {
    const last = c.answers.at(-1);
    parts.push(
      text(
        `\n<cartao tipo="${c.type}">\n${c.body || '(sem texto: análise geral dos arquivos)'}\n${
          last ? `\n<resposta_anterior>\n${last.text}\n</resposta_anterior>\n` : ''
        }</cartao>\n`,
      ),
    );
  }
  if (cardFiles.length) parts.push(text('\n## Arquivos\n'), ...files(cardFiles));
  return parts;
}

export const VISION_PROMPT =
  'Transcreva fielmente todo o texto visível nesta imagem, mantendo a ordem e a numeração (fórmulas em LaTeX). Depois descreva gráficos, tabelas, diagramas e figuras relevantes para estudo. Não resolva nada: apenas transcreva e descreva. Responda em português.';
