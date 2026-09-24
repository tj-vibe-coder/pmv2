import React, { useMemo, useState } from 'react';
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import type { AiCitation } from '../../types/AiAssist';

// Source chips for one assistant answer. Each chip is a record a tool actually
// read, so it says WHAT the record is (a bare "Rezcoat" could be an opportunity
// or a client) and, via the caption, HOW fresh the read was — the tools already
// return `asOf` per source but it used to be discarded entirely.
// Raw Firestore keys are squashed for DISPLAY only — tools.js can still fall
// back to a document id as `label` when a record has no name/code; that source
// data is unchanged, this only keeps a 20-char key from being the visible text.

const COLLAPSE_AFTER = 4;

const ROUTE_KINDS: { prefix: string; kind: string }[] = [
  { prefix: '/sales/calcsheet/quotations/', kind: 'Quotation' },
  { prefix: '/sales/calcsheet/projects/', kind: 'Opportunity' },
  { prefix: '/projects/', kind: 'Project' },
  { prefix: '/sales/clients', kind: 'Client' },
  { prefix: '/expense-monitoring', kind: 'Expenses' },
  { prefix: '/projects', kind: 'Portfolio' },
];

// A Firestore auto-id: long, unspaced, mixed case. Deliberately does not match
// IOCT codes such as PCS2602005-ADI-00, which carry no lowercase letters.
const DOCUMENT_KEY = /^(?=.*[a-z])(?=.*[A-Z0-9])[A-Za-z0-9_-]{16,}$/;

function citationKind(route: string): string {
  const match = ROUTE_KINDS.find((entry) => route.startsWith(entry.prefix));
  return match ? match.kind : 'Page';
}

function citationLabel(label: string, kind: string): string {
  const trimmed = label.trim();
  if (!trimmed) return kind;
  return trimmed
    .split(/\s+/)
    .map((token) => (DOCUMENT_KEY.test(token) ? `${token.slice(0, 6)}…` : token))
    .join(' ');
}

function formatAsOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const isToday = at.toDateString() === new Date().toDateString();
  return isToday
    ? at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface AiSourceListProps {
  citations: AiCitation[];
  onNavigateSource: (route: string) => void;
}

export default function AiSourceList({ citations, onNavigateSource }: AiSourceListProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const unique: AiCitation[] = [];
    citations.forEach((citation) => {
      if (seen.has(citation.id)) return;
      seen.add(citation.id);
      unique.push(citation);
    });
    return unique.map((citation) => {
      const kind = citationKind(citation.route);
      return { ...citation, kind, display: citationLabel(citation.label, kind) };
    });
  }, [citations]);

  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, COLLAPSE_AFTER);
  const hidden = items.length - visible.length;
  // Every source in a turn shares that tool run's asOf; take the oldest anyway
  // so the caption can never claim the data is fresher than it is.
  const stamps = items.map((item) => item.asOf).filter(Boolean).sort();
  const asOf = stamps.length ? formatAsOf(stamps[0]) : '';
  const countLabel = items.length === 1 ? '1 source' : `${items.length} sources`;
  const summary = asOf ? `${countLabel} · as of ${asOf}` : countLabel;

  return (
    <Box aria-label="Sources" sx={{ mt: 0.75 }}>
      <Typography color="text.secondary" variant="caption">{summary}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
        {visible.map((item) => (
          <Tooltip key={item.id} title={`${item.kind} · ${item.label}`}>
            <Chip
              aria-label={`Open ${item.kind} ${item.display}`}
              label={(
                <Stack alignItems="baseline" component="span" direction="row" spacing={0.5}>
                  <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.65rem', letterSpacing: 0.3, textTransform: 'uppercase' }}>
                    {item.kind}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: '0.75rem' }}>{item.display}</Typography>
                </Stack>
              )}
              onClick={() => onNavigateSource(item.route)}
              size="small"
            />
          </Tooltip>
        ))}
        {hidden > 0 && (
          <Chip label={`+${hidden} more`} onClick={() => setExpanded(true)} size="small" variant="outlined" />
        )}
        {expanded && items.length > COLLAPSE_AFTER && (
          <Chip label="Show fewer" onClick={() => setExpanded(false)} size="small" variant="outlined" />
        )}
      </Box>
    </Box>
  );
}
