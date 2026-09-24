import { useMemo, useState, useEffect } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { nanoid } from 'nanoid';
import { useQuotationStore } from '../../store/quotationStore';
import type {
  Quotation, GeneralReqLine, ComponentLine, ServiceLine, ManpowerEntry,
} from '../../types/Quotation';

const id = () => nanoid(6);

// Lines the user chose to bring into the current quotation (already re-id'd).
export interface CopiedInclusions {
  generalReqts: GeneralReqLine[];
  components: ComponentLine[];
  services: ServiceLine[];
  manpower: ManpowerEntry[];
  terms?: Quotation['termsOverrides'];
}

interface CopyInclusionsDialogProps {
  open: boolean;
  currentQuotationId: string;
  onClose: () => void;
  onCopy: (picked: CopiedInclusions) => void;
}

type SectionKey = 'generalReqts' | 'components' | 'services' | 'manpower';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'generalReqts', label: 'General Requirements' },
  { key: 'components', label: 'Components' },
  { key: 'services', label: 'Services' },
  { key: 'manpower', label: 'Manpower' },
];

function lineLabel(key: SectionKey, line: GeneralReqLine | ComponentLine | ServiceLine | ManpowerEntry): { primary: string; secondary: string } {
  if (key === 'manpower') {
    const m = line as ManpowerEntry;
    return { primary: m.role || '(role)', secondary: `${m.group} · ${m.headcount || 0}× · ${m.mandays || 0} md` };
  }
  const l = line as GeneralReqLine | ComponentLine | ServiceLine;
  const code = (l as { code?: string }).code;
  const primary = l.description || code || '(untitled)';
  let secondary = code ? code : '';
  if (key === 'components') { const c = line as ComponentLine; secondary = [code, c.brand, `${c.qty || 0} ${c.uom || ''}`.trim()].filter(Boolean).join(' · '); }
  else if (key === 'services') { const s = line as ServiceLine; secondary = [code, s.days ? `${s.days} d` : ''].filter(Boolean).join(' · '); }
  else if (key === 'generalReqts') { const g = line as GeneralReqLine; secondary = [code, `${g.qty || 0} ${g.uom || ''}`.trim()].filter(Boolean).join(' · '); }
  return { primary, secondary };
}

export default function CopyInclusionsDialog({ open, currentQuotationId, onClose, onCopy }: CopyInclusionsDialogProps) {
  const quotations = useQuotationStore((s) => s.quotations);
  const projects = useQuotationStore((s) => s.projects);
  const clients = useQuotationStore((s) => s.clients);

  const [source, setSource] = useState<Quotation | null>(null);
  const [sel, setSel] = useState<Record<SectionKey, Set<string>>>({ generalReqts: new Set(), components: new Set(), services: new Set(), manpower: new Set() });
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({ generalReqts: true, components: true, services: true, manpower: true });
  const [copyTerms, setCopyTerms] = useState(false);

  const options = useMemo(() => {
    const projById = new Map(projects.map((p) => [p.id, p]));
    const cliById = new Map(clients.map((c) => [c.id, c]));
    return quotations
      .filter((q) => q.id !== currentQuotationId)
      .map((q) => {
        const p = projById.get(q.projectId);
        const cli = q.recipientId ? cliById.get(q.recipientId) : undefined;
        const label = `${p?.code || 'Draft'} — ${p?.name || 'Untitled'} · ${q.kind} rev ${q.revision}${cli ? ` · ${cli.name}` : ''}`;
        return { q, label };
      })
      .sort((a, b) => (b.q.updatedAt || '').localeCompare(a.q.updatedAt || ''));
  }, [quotations, projects, clients, currentQuotationId]);

  // Default: everything in the picked source selected.
  useEffect(() => {
    if (!source) { setSel({ generalReqts: new Set(), components: new Set(), services: new Set(), manpower: new Set() }); return; }
    setSel({
      generalReqts: new Set((source.generalReqts || []).map((l) => l.id)),
      components: new Set((source.components || []).map((l) => l.id)),
      services: new Set((source.services || []).map((l) => l.id)),
      manpower: new Set((source.manpower || []).map((l) => l.id)),
    });
    setCopyTerms(false);
  }, [source]);

  const linesOf = (key: SectionKey): (GeneralReqLine | ComponentLine | ServiceLine | ManpowerEntry)[] => (source ? (source[key] || []) : []);

  const toggleLine = (key: SectionKey, lineId: string) => setSel((prev) => {
    const next = new Set(prev[key]);
    if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
    return { ...prev, [key]: next };
  });
  const toggleSection = (key: SectionKey) => setSel((prev) => {
    const all = linesOf(key).map((l) => l.id);
    const allSelected = all.length > 0 && all.every((x) => prev[key].has(x));
    return { ...prev, [key]: new Set(allSelected ? [] : all) };
  });

  const totalSelected = SECTIONS.reduce((n, s) => n + sel[s.key].size, 0);

  const handleCopy = () => {
    if (!source) return;
    const pick = <T extends { id: string }>(key: SectionKey) => (source[key] as unknown as T[] || []).filter((l) => sel[key].has(l.id)).map((l) => ({ ...l, id: id() }));
    onCopy({
      generalReqts: pick<GeneralReqLine>('generalReqts'),
      components: pick<ComponentLine>('components'),
      services: pick<ServiceLine>('services'),
      manpower: pick<ManpowerEntry>('manpower'),
      terms: copyTerms ? source.termsOverrides : undefined,
    });
  };

  const handleClose = () => { setSource(null); onClose(); };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Copy inclusions from another quotation
        <Typography variant="body2" color="text.secondary">
          Pick a source quotation, choose the sections or lines to reuse, and they'll be added to the
          quotation you're editing (fresh ids — you can still adjust prices).
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Autocomplete
          size="small"
          options={options}
          value={options.find((o) => o.q.id === source?.id) || null}
          onChange={(_e, v) => setSource(v ? v.q : null)}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.q.id === b.q.id}
          renderInput={(params) => <TextField {...params} label="Source quotation" placeholder="Search by project code, name, or client" />}
          sx={{ mb: 2 }}
        />

        {!source ? (
          <Alert severity="info">Choose a source quotation to see its inclusions.</Alert>
        ) : (
          <Stack spacing={0.5}>
            {SECTIONS.map(({ key, label }) => {
              const lines = linesOf(key);
              const selCount = sel[key].size;
              const allSel = lines.length > 0 && lines.every((l) => sel[key].has(l.id));
              const someSel = selCount > 0 && !allSel;
              return (
                <Box key={key} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.5 }}>
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}>
                      {expanded[key] ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                    </IconButton>
                    <Checkbox
                      size="small"
                      checked={allSel}
                      indeterminate={someSel}
                      disabled={lines.length === 0}
                      onChange={() => toggleSection(key)}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>{label}</Typography>
                    <Typography variant="caption" color="text.secondary">{selCount}/{lines.length}</Typography>
                  </Box>
                  <Collapse in={expanded[key]}>
                    <Box sx={{ px: 1, pb: 0.5 }}>
                      {lines.length === 0 ? (
                        <Typography variant="caption" color="text.disabled" sx={{ pl: 5 }}>No {label.toLowerCase()} in this quotation.</Typography>
                      ) : lines.map((line) => {
                        const { primary, secondary } = lineLabel(key, line);
                        return (
                          <Box key={line.id} sx={{ display: 'flex', alignItems: 'flex-start', pl: 4 }}>
                            <Checkbox size="small" sx={{ p: 0.25, mt: 0.25 }} checked={sel[key].has(line.id)} onChange={() => toggleLine(key, line.id)} />
                            <Box sx={{ minWidth: 0, py: 0.25 }}>
                              <Typography variant="body2" noWrap>{primary}</Typography>
                              {secondary && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{secondary}</Typography>}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
            {(source.termsOverrides?.scopeOfWork || source.termsOverrides?.exclusions) && (
              <FormControlLabel
                sx={{ mt: 0.5 }}
                control={<Checkbox size="small" checked={copyTerms} onChange={(e) => setCopyTerms(e.target.checked)} />}
                label={<Typography variant="body2">Also copy Scope of Work &amp; Exclusions text</Typography>}
              />
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCopy} disabled={!source || (totalSelected === 0 && !copyTerms)}>
          Copy{totalSelected > 0 ? ` ${totalSelected} line${totalSelected === 1 ? '' : 's'}` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
