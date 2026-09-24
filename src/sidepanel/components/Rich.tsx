import type { ReactNode } from 'react';

// Localized copy can carry lightweight inline markup so a whole sentence stays
// translatable while still rendering emphasis, code, and links:
//   **bold**   `code`   [label](https://example.com)
// Messages without markup render as plain text. URLs come from trusted registry
// values substituted into the message, never from document or model content.
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

export function rich(message: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0, match: RegExpExecArray | null, index = 0;
  while ((match = TOKEN.exec(message))) {
    if (match.index > last) nodes.push(message.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) nodes.push(<strong key={index++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) nodes.push(<code key={index++}>{token.slice(1, -1)}</code>);
    else {
      const split = token.indexOf('](');
      nodes.push(<a key={index++} href={token.slice(split + 2, -1)} target="_blank" rel="noreferrer">{token.slice(1, split)}</a>);
    }
    last = match.index + token.length;
  }
  if (last < message.length) nodes.push(message.slice(last));
  return nodes;
}

export function Rich({ message }: { message: string }) {
  return <>{rich(message)}</>;
}
