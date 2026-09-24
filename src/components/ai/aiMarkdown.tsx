import React from 'react';
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

// Renders a constrained subset of markdown (headings, bold, inline code,
// bullet/numbered lists, pipe tables) coming from the AI Assist model. Every
// token below turns into a React element or a plain text node — never raw HTML — so arbitrary
// model output (including HTML-looking strings) can never become markup.
// See AiMessageList.test.tsx: "renders a model string containing HTML literally".

const INLINE_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(INLINE_TOKEN).filter((part) => part !== '');
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <Box component="code" key={key} sx={{ bgcolor: 'action.selected', borderRadius: 0.5, px: 0.5, fontSize: '0.85em' }}>
          {part.slice(1, -1)}
        </Box>
      );
    }
    return part;
  });
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function isListItem(line: string): { ordered: boolean; content: string } | null {
  const bullet = line.match(/^\s*[-*]\s+(.+)$/);
  if (bullet) return { ordered: false, content: bullet[1] };
  const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
  if (numbered) return { ordered: true, content: numbered[1] };
  return null;
}

function parseHeading(line: string): { level: 1 | 2 | 3; content: string } | null {
  const match = line.match(/^\s{0,3}(#{1,3})\s+(.+?)(?:\s+#+)?\s*$/);
  if (!match) return null;
  return { level: match[1].length as 1 | 2 | 3, content: match[2] };
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'p'; lines: string[] };

function toBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      blocks.push({ type: 'heading', ...heading });
      i += 1;
      continue;
    }

    if (isTableRow(line)) {
      const rows: string[][] = [parseTableRow(line)];
      i += 1;
      if (i < lines.length && isTableSeparator(lines[i])) i += 1;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    const item = isListItem(line);
    if (item) {
      const items = [item.content];
      const ordered = item.ordered;
      i += 1;
      while (i < lines.length) {
        const next = isListItem(lines[i]);
        if (!next) break;
        items.push(next.content);
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const pLines = [line];
    i += 1;
    while (
      i < lines.length
      && lines[i].trim() !== ''
      && !parseHeading(lines[i])
      && !isListItem(lines[i])
      && !isTableRow(lines[i])
    ) {
      pLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'p', lines: pLines });
  }
  return blocks;
}

export function renderAiMarkdown(text: string): React.ReactNode {
  const blocks = toBlocks(text);
  return blocks.map((block, blockIndex) => {
    const key = `b-${blockIndex}`;

    if (block.type === 'heading') {
      const component = (['h2', 'h3', 'h4'] as const)[block.level - 1];
      const variant = block.level === 1 ? 'subtitle1' : block.level === 2 ? 'subtitle2' : 'body2';
      return (
        <Typography component={component} key={key} sx={{ fontWeight: 700, mb: 0.5, mt: blockIndex === 0 ? 0 : 1 }} variant={variant}>
          {renderInline(block.content, key)}
        </Typography>
      );
    }

    if (block.type === 'table') {
      const [header, ...body] = block.rows;
      return (
        <TableContainer key={key} sx={{ my: 0.75, maxWidth: '100%' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {header.map((cell, cellIndex) => (
                  <TableCell key={`${key}-h-${cellIndex}`} sx={{ fontWeight: 600, py: 0.5 }}>
                    {renderInline(cell, `${key}-h-${cellIndex}`)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {body.map((row, rowIndex) => (
                <TableRow key={`${key}-r-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={`${key}-r-${rowIndex}-${cellIndex}`} sx={{ py: 0.5 }}>
                      {renderInline(cell, `${key}-r-${rowIndex}-${cellIndex}`)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    }

    if (block.type === 'list') {
      return (
        <Box component={block.ordered ? 'ol' : 'ul'} key={key} sx={{ m: 0, my: 0.5, pl: 2.5 }}>
          {block.items.map((item, itemIndex) => (
            <Typography component="li" key={`${key}-${itemIndex}`} variant="body2" sx={{ mb: 0.25 }}>
              {renderInline(item, `${key}-${itemIndex}`)}
            </Typography>
          ))}
        </Box>
      );
    }

    return (
      <Typography key={key} variant="body2" sx={{ mb: 0.5, '&:last-child': { mb: 0 } }}>
        {block.lines.map((line, lineIndex) => (
          <React.Fragment key={`${key}-${lineIndex}`}>
            {lineIndex > 0 && <br />}
            {renderInline(line, `${key}-${lineIndex}`)}
          </React.Fragment>
        ))}
      </Typography>
    );
  });
}
