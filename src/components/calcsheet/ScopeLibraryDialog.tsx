import { useMemo, useState, useEffect } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, IconButton, List, ListItemButton, Stack, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import { nanoid } from 'nanoid';
import { useQuotationStore } from '../../store/quotationStore';
import type {
  ScopeBundle, GeneralReqLine, ComponentLine, ServiceLine, ManpowerEntry,
} from '../../types/Quotation';
import type { CopiedInclusions } from './CopyInclusionsDialog';

const newId = () => nanoid(6);

type SectionKey = 'generalReqts' | 'components' | 'services' | 'manpower';
type AnyLine = GeneralReqLine | ComponentLine | ServiceLine | ManpowerEntry;

const SECTIONS: { key: SectionKey; label: string; short: string }[] = [
  { key: 'generalReqts', label: 'General Requirements', short: 'GR' },
  { key: 'components', label: 'Components', short: 'comp' },
  { key: 'services', label: 'Services', short: 'svc' },
  { key: 'manpower', label: 'Manpower', short: 'MP' },
];

// A set of inclusions the tree can render + select over (bundle or current draft).
interface Sections {
  generalReqts: GeneralReqLine[];
  components: ComponentLine[];
  services: ServiceLine[];
  manpower: ManpowerEntry[];
  terms?: { scopeOfWork?: string; exclusions?: string };
}

const emptySel = (): Record<SectionKey, Set<string>> =>
  ({ generalReqts: new Set(), components: new Set(), services: new Set(), manpower: new Set() });

const allSelFor = (s: Sections): Record<SectionKey, Set<string>> => ({
  generalReqts: new Set((s.generalReqts || []).map((l) => l.id)),
  components: new Set((s.components || []).map((l) => l.id)),
  services: new Set((s.services || []).map((l) => l.id)),
  manpower: new Set((s.manpower || []).map((l) => l.id)),
});

function lineLabel(key: SectionKey, line: AnyLine): { primary: string; secondary: string } {
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

const bundleCounts = (b: Sections) =>
  SECTIONS.map((s) => ({ short: s.short, n: (b[s.key] || []).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${x.short}`)
    .join(' · ') || 'empty';

// Checkbox tree over the four sections. Controlled selection lives in the parent.
function SectionTree({ sections, sel, setSel }: {
  sections: Sections;
  sel: Record<SectionKey, Set<string>>;
  setSel: React.Dispatch<React.SetStateAction<Record<SectionKey, Set<string>>>>;
}) {
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({ generalReqts: true, components: true, services: true, manpower: true });
  const linesOf = (key: SectionKey): AnyLine[] => (sections[key] || []) as AnyLine[];

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

  return (
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
              <Checkbox size="small" checked={allSel} indeterminate={someSel} disabled={lines.length === 0} onChange={() => toggleSection(key)} />
              <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>{label}</Typography>
              <Typography variant="caption" color="text.secondary">{selCount}/{lines.length}</Typography>
            </Box>
            <Collapse in={expanded[key]}>
              <Box sx={{ px: 1, pb: 0.5 }}>
                {lines.length === 0 ? (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 5 }}>No {label.toLowerCase()}.</Typography>
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
    </Stack>
  );
}

// Pull the selected lines out of a sections object, re-id'd so they're independent.
function pickFrom(sections: Sections, sel: Record<SectionKey, Set<string>>, copyTerms: boolean): CopiedInclusions {
  const pick = <T extends { id: string }>(key: SectionKey) =>
    ((sections[key] as unknown as T[]) || []).filter((l) => sel[key].has(l.id)).map((l) => ({ ...l, id: newId() }));
  return {
    generalReqts: pick<GeneralReqLine>('generalReqts'),
    components: pick<ComponentLine>('components'),
    services: pick<ServiceLine>('services'),
    manpower: pick<ManpowerEntry>('manpower'),
    terms: copyTerms ? sections.terms : undefined,
  };
}

const totalSel = (sel: Record<SectionKey, Set<string>>) => SECTIONS.reduce((n, s) => n + sel[s.key].size, 0);

interface ScopeLibraryDialogProps {
  open: boolean;
  current: Sections;                          // the quotation being edited (for the Save tab)
  onClose: () => void;
  onInsert: (picked: CopiedInclusions) => void;
  onSaved?: (name: string) => void;
}

export default function ScopeLibraryDialog({ open, current, onClose, onInsert, onSaved }: ScopeLibraryDialogProps) {
  const scopeBundles = useQuotationStore((s) => s.scopeBundles);
  const addScopeBundle = useQuotationStore((s) => s.addScopeBundle);
  const deleteScopeBundle = useQuotationStore((s) => s.deleteScopeBundle);

  const [tab, setTab] = useState(0);

  // ── Insert tab state ──
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [insertSel, setInsertSel] = useState<Record<SectionKey, Set<string>>>(emptySel);
  const [insertTerms, setInsertTerms] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Save tab state ──
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [saveSel, setSaveSel] = useState<Record<SectionKey, Set<string>>>(emptySel);
  const [saveTerms, setSaveTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(scopeBundles.map((b) => (b.category || '').trim()).filter(Boolean))).sort(),
    [scopeBundles],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scopeBundles.filter((b) => {
      if (catFilter && (b.category || '') !== catFilter) return false;
      if (!q) return true;
      return `${b.name} ${b.category || ''} ${b.notes || ''}`.toLowerCase().includes(q);
    });
  }, [scopeBundles, query, catFilter]);

  const picked = useMemo(() => scopeBundles.find((b) => b.id === pickedId) || null, [scopeBundles, pickedId]);

  // Default every line selected when a bundle is picked.
  useEffect(() => {
    if (!picked) { setInsertSel(emptySel()); setInsertTerms(false); return; }
    setInsertSel(allSelFor(picked));
    setInsertTerms(false);
  }, [picked]);

  // Reset the Save tab to "everything in the current draft selected" whenever
  // the dialog (re)opens on the Save tab.
  useEffect(() => {
    if (!open) return;
    setSaveSel(allSelFor(current));
    setSaveTerms(false);
    setName(''); setCategory(''); setNotes(''); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => { setPickedId(null); setQuery(''); setCatFilter(null); onClose(); };

  const handleInsert = () => {
    if (!picked) return;
    onInsert(pickFrom(picked, insertSel, insertTerms));
  };

  const handleDelete = async (b: ScopeBundle) => {
    setDeletingId(b.id);
    try {
      await deleteScopeBundle(b.id);
      if (pickedId === b.id) setPickedId(null);
    } catch {
      setError('Could not delete that bundle.');
    } finally {
      setDeletingId(null);
    }
  };

  const currentHasTerms = !!(current.terms?.scopeOfWork || current.terms?.exclusions);
  const currentCounts = bundleCounts(current);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Give the bundle a name.'); return; }
    const body = pickFrom(current, saveSel, saveTerms);
    setSaving(true);
    setError(null);
    try {
      await addScopeBundle({
        name: trimmed,
        category: category.trim() || undefined,
        notes: notes.trim() || undefined,
        generalReqts: body.generalReqts,
        components: body.components,
        services: body.services,
        manpower: body.manpower,
        terms: body.terms,
      });
      // Clear the Save form so re-visiting the tab this session starts fresh
      // (guards against accidentally saving the same bundle twice), then jump
      // to the Insert tab so they see it landed in the library.
      setName(''); setCategory(''); setNotes('');
      setSaveSel(allSelFor(current)); setSaveTerms(false);
      setTab(0);
      setQuery(''); setCatFilter(null);
      onSaved?.(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the bundle.');
    } finally {
      setSaving(false);
    }
  };

  const insertCount = totalSel(insertSel);
  const saveCount = totalSel(saveSel);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>
        Scope Library
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          A shared library of reusable inclusion sets — save the scope you use again and again, then
          drop it into any quotation.
        </Typography>
      </DialogTitle>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`Insert from library${scopeBundles.length ? ` (${scopeBundles.length})` : ''}`} />
        <Tab label="Save to library" icon={<BookmarkAddOutlinedIcon fontSize="small" />} iconPosition="start" />
      </Tabs>

      <DialogContent dividers>
        {error && <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}

        {tab === 0 ? (
          scopeBundles.length === 0 ? (
            <Alert severity="info">
              The library is empty. Switch to <strong>Save to library</strong> to add the current
              quotation's scope as your first reusable bundle.
            </Alert>
          ) : (
            <Stack spacing={1.5}>
              <TextField
                size="small" fullWidth value={query} onChange={(e) => setQuery(e.target.value)}
                label="Search the library" placeholder="Search by name, category, or notes"
              />
              {categories.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  <Chip size="small" label="All" color={catFilter === null ? 'primary' : 'default'} onClick={() => setCatFilter(null)} />
                  {categories.map((c) => (
                    <Chip key={c} size="small" label={c} color={catFilter === c ? 'primary' : 'default'} onClick={() => setCatFilter(c)} />
                  ))}
                </Box>
              )}
              <List dense disablePadding sx={{ maxHeight: 220, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                {filtered.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No bundles match your search.</Typography>
                ) : filtered.map((b) => (
                  <ListItemButton
                    key={b.id}
                    selected={pickedId === b.id}
                    onClick={() => setPickedId(b.id)}
                    sx={{ alignItems: 'flex-start' }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{b.name}</Typography>
                        {b.category && <Chip size="small" label={b.category} variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />}
                      </Box>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {bundleCounts(b)}{b.createdByName ? ` · ${b.createdByName}` : ''}{b.notes ? ` · ${b.notes}` : ''}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small" edge="end" title="Delete this bundle"
                      disabled={deletingId === b.id}
                      onClick={(e) => { e.stopPropagation(); handleDelete(b); }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </ListItemButton>
                ))}
              </List>

              {picked && (
                <>
                  <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Choose what to insert from “{picked.name}”</Typography></Divider>
                  <SectionTree sections={picked} sel={insertSel} setSel={setInsertSel} />
                  {(picked.terms?.scopeOfWork || picked.terms?.exclusions) && (
                    <FormControlLabel
                      control={<Checkbox size="small" checked={insertTerms} onChange={(e) => setInsertTerms(e.target.checked)} />}
                      label={<Typography variant="body2">Also insert Scope of Work &amp; Exclusions text</Typography>}
                    />
                  )}
                </>
              )}
            </Stack>
          )
        ) : (
          <Stack spacing={1.5}>
            <TextField
              size="small" fullWidth required value={name} onChange={(e) => setName(e.target.value)}
              label="Bundle name" placeholder="e.g. Standard SCADA general requirements"
            />
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                size="small" value={category} onChange={(e) => setCategory(e.target.value)}
                label="Category (optional)" placeholder="e.g. SCADA, Panel Build" sx={{ flex: 1 }}
              />
            </Box>
            <TextField
              size="small" fullWidth multiline minRows={1} value={notes} onChange={(e) => setNotes(e.target.value)}
              label="Notes (optional)" placeholder="When to use this bundle"
            />
            <Divider textAlign="left"><Typography variant="caption" color="text.secondary">Choose what to save from this quotation ({currentCounts})</Typography></Divider>
            <SectionTree sections={current} sel={saveSel} setSel={setSaveSel} />
            {currentHasTerms && (
              <FormControlLabel
                control={<Checkbox size="small" checked={saveTerms} onChange={(e) => setSaveTerms(e.target.checked)} />}
                label={<Typography variant="body2">Also save Scope of Work &amp; Exclusions text</Typography>}
              />
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>Close</Button>
        {tab === 0 ? (
          <Button variant="contained" onClick={handleInsert} disabled={!picked || (insertCount === 0 && !insertTerms)}>
            Insert{insertCount > 0 ? ` ${insertCount} line${insertCount === 1 ? '' : 's'}` : ''}
          </Button>
        ) : (
          <Button variant="contained" onClick={handleSave} disabled={saving || !name.trim() || (saveCount === 0 && !saveTerms)}>
            {saving ? 'Saving…' : 'Save to library'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
