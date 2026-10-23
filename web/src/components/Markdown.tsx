import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * Modelos escrevem LaTeX como \( \) e \[ \]; o remark-math só entende $ e $$.
 * E no remark-math 6, "$$x$$" numa linha só é fórmula inline: bloco exige os $$ em linhas próprias.
 */
function normalizeMath(src: string) {
  return src
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m.trim()}$`)
    .replace(/^[ \t]*\$\$([^\n]+?)\$\$[ \t]*$/gm, (_, m) => `$$\n${m.trim()}\n$$`);
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  );
});
