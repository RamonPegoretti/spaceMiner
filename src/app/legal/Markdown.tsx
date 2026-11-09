import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * A tiny Markdown renderer for the legal pages: headings, paragraphs, bullet lists,
 * tables, **bold** and [links](/path). [[Placeholders]] are highlighted so the
 * operator can spot what is still missing. Enough for our own texts, not general Markdown.
 */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[\[(.+?)\]\]|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${m.index}`;
    if (m[1] !== undefined) out.push(<mark key={k} className="placeholder">[[{m[1]}]]</mark>);
    else if (m[2] !== undefined) out.push(<strong key={k}>{inline(m[2], key + 1)}</strong>);
    else if (m[4].startsWith('/')) out.push(<Link key={k} href={m[4]}>{m[3]}</Link>);
    else out.push(<a key={k} href={m[4]} rel="noopener noreferrer">{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) {
      i++;
    } else if (line.startsWith('#')) {
      const level = Math.min(line.match(/^#+/)![0].length, 4);
      const body = inline(line.replace(/^#+\s*/, ''));
      // The page title is h1; numbered sections are h2; subsections h3.
      out.push(level === 1 ? <h1 key={k}>{body}</h1> : level <= 4 && !line.startsWith('#####') ? <h2 key={k}>{body}</h2> : <h3 key={k}>{body}</h3>);
      i++;
    } else if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      out.push(<ul key={k}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
    } else if (line.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      out.push(
        <div key={k} className="legal-table">
          <table>
            <thead><tr>{cells(head).map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, j) => <tr key={j}>{cells(r).map((c, n) => <td key={n}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|- |\|)/.test(lines[i])) para.push(lines[i++]);
      out.push(<p key={k}>{inline(para.join(' '))}</p>);
    }
  }
  return <>{out}</>;
}
