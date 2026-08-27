import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Switch,
  FormControlLabel,
  Grid,
  Alert,
  Divider,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import PostAddIcon from '@mui/icons-material/PostAdd';
import type { StatementOfAccount, SoaItem, SoaFootnote } from '../../../types/StatementOfAccount';
import {
  computeSoaTotals,
  DEFAULT_SOA_FOOTNOTES,
  DEFAULT_SOA_BODY_TEXT,
} from '../../../types/StatementOfAccount';
import { nanoid } from 'nanoid';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
  accent1: '#4f7bc8',
};

const NUM = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface SoaEditorDialogProps {
  open: boolean;
  soa: StatementOfAccount | null;
  onClose: () => void;
  onSave: (payload: Partial<StatementOfAccount>) => Promise<void>;
  availableProjects?: Array<{ id: number | string; project_name: string; po_number?: string; contract_amount?: number; account_name?: string }>;
}

export default function SoaEditorDialog({
  open,
  soa,
  onClose,
  onSave,
  availableProjects = [],
}: SoaEditorDialogProps) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [recipientName, setRecipientName] = useState('Advance Controle Technologie Inc');
  const [recipientCode, setRecipientCode] = useState('ACT');
  const [recipientContactName, setRecipientContactName] = useState('Lindsey Salilig');
  const [recipientContactPhone, setRecipientContactPhone] = useState('0917-5046701');
  const [recipientAddress, setRecipientAddress] = useState(
    'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite, Region IV-A (Calabarzon), 4117'
  );
  const [subject, setSubject] = useState('Consolidated Statement of Account – Outstanding Billings');
  const [salutation, setSalutation] = useState('Dear Sir Lindsey,');
  const [bodyText, setBodyText] = useState(DEFAULT_SOA_BODY_TEXT);

  const [items, setItems] = useState<SoaItem[]>([]);
  const [footnotes, setFootnotes] = useState<SoaFootnote[]>(DEFAULT_SOA_FOOTNOTES);

  const [preparedByName, setPreparedByName] = useState('Reuel Joshua Rivera');
  const [preparedByTitle, setPreparedByTitle] = useState('Solutions Manager');
  const [preparedByPhone, setPreparedByPhone] = useState('+63 919 082 5434');
  const [preparedByEmail, setPreparedByEmail] = useState('rj.rivera@iocontroltech.com');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form
  useEffect(() => {
    if (open) {
      if (soa) {
        setDate(soa.date || new Date().toISOString().slice(0, 10));
        setRecipientName(soa.recipientName || 'Advance Controle Technologie Inc');
        setRecipientCode(soa.recipientCode || 'ACT');
        setRecipientContactName(soa.recipientContactName || 'Lindsey Salilig');
        setRecipientContactPhone(soa.recipientContactPhone || '');
        setRecipientAddress(soa.recipientAddress || '');
        setSubject(soa.subject || 'Consolidated Statement of Account – Outstanding Billings');
        setSalutation(soa.salutation || 'Dear Sir Lindsey,');
        setBodyText(soa.bodyText || DEFAULT_SOA_BODY_TEXT);
        setItems(soa.items ? JSON.parse(JSON.stringify(soa.items)) : []);
        setFootnotes(soa.footnotes && soa.footnotes.length ? JSON.parse(JSON.stringify(soa.footnotes)) : DEFAULT_SOA_FOOTNOTES);
        setPreparedByName(soa.preparedByName || 'Reuel Joshua Rivera');
        setPreparedByTitle(soa.preparedByTitle || 'Solutions Manager');
        setPreparedByPhone(soa.preparedByPhone || '+63 919 082 5434');
        setPreparedByEmail(soa.preparedByEmail || 'rj.rivera@iocontroltech.com');
      } else {
        setDate(new Date().toISOString().slice(0, 10));
        setRecipientName('Advance Controle Technologie Inc');
        setRecipientCode('ACT');
        setRecipientContactName('Lindsey Salilig');
        setRecipientContactPhone('0917-5046701');
        setRecipientAddress(
          'Block 13 Lot 8, Mindanao Ave., Gavino Maderan, Gen. Mariano Alvarez, Cavite, Region IV-A (Calabarzon), 4117'
        );
        setSubject('Consolidated Statement of Account – Outstanding Billings');
        setSalutation('Dear Sir Lindsey,');
        setBodyText(DEFAULT_SOA_BODY_TEXT);
        setItems([]);
        setFootnotes(DEFAULT_SOA_FOOTNOTES);
      }
      setError(null);
    }
  }, [open, soa]);

  const handleAddItem = (hasPo = true) => {
    const newItem: SoaItem = {
      id: nanoid(8),
      projectName: '',
      description: '',
      completionDateText: '',
      poNumber: hasPo ? '' : '',
      poDate: hasPo ? new Date().toISOString().slice(0, 10) : '',
      amount: 0,
      hasPo,
      footnoteSymbol: hasPo ? undefined : '*',
    };
    setItems([...items, newItem]);
  };

  const handleImportProject = (proj: { id: number | string; project_name: string; po_number?: string; contract_amount?: number; account_name?: string }) => {
    const hasPo = !!proj.po_number;
    const newItem: SoaItem = {
      id: nanoid(8),
      projectId: String(proj.id),
      projectName: proj.account_name || proj.project_name || 'Project',
      description: proj.project_name,
      completionDateText: '',
      poNumber: proj.po_number || '',
      poDate: hasPo ? new Date().toISOString().slice(0, 10) : '',
      amount: Number(proj.contract_amount) || 0,
      hasPo,
      footnoteSymbol: hasPo ? undefined : '*',
    };
    setItems([...items, newItem]);
  };

  const handleUpdateItem = (index: number, updates: Partial<SoaItem>) => {
    const updated = [...items];
    updated[index] = { ...updated[index], ...updates };
    setItems(updated);
  };

  const handleDeleteItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleAddFootnote = () => {
    setFootnotes([...footnotes, { symbol: '*', text: '' }]);
  };

  const handleUpdateFootnote = (index: number, updates: Partial<SoaFootnote>) => {
    const updated = [...footnotes];
    updated[index] = { ...updated[index], ...updates };
    setFootnotes(updated);
  };

  const handleDeleteFootnote = (index: number) => {
    setFootnotes(footnotes.filter((_, i) => i !== index));
  };

  const totals = computeSoaTotals(items);

  const handleSubmit = async () => {
    if (items.length === 0) {
      setError('Please add at least one line item to the Statement of Account.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...(soa?.id && { id: soa.id }),
        date,
        recipientName,
        recipientCode,
        recipientContactName,
        recipientContactPhone,
        recipientAddress,
        subject,
        salutation,
        bodyText,
        items,
        footnotes,
        preparedByName,
        preparedByTitle,
        preparedByPhone,
        preparedByEmail,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save Statement of Account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
        {soa ? `Edit ${soa.soaNo}` : 'New Statement of Account'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Recipient & Document Info */}
          <Paper sx={{ p: 2, bgcolor: '#fbfcfd' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mb: 1.5 }}>
              1. Document & Recipient Information
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="SOA Date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Recipient Entity"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="Recipient Code"
                  value={recipientCode}
                  onChange={(e) => setRecipientCode(e.target.value.toUpperCase())}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Attention / Contact Person"
                  value={recipientContactName}
                  onChange={(e) => setRecipientContactName(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Contact Phone"
                  value={recipientContactPhone}
                  onChange={(e) => setRecipientContactPhone(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Salutation"
                  value={salutation}
                  onChange={(e) => setSalutation(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Recipient Address"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
            </Grid>
          </Paper>

          {/* Line Items Table */}
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                2. Account Summary Line Items ({items.length})
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => handleAddItem(true)}
                  sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
                >
                  Add With PO
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => handleAddItem(false)}
                  sx={{ borderColor: NET_PACIFIC_COLORS.accent1, color: NET_PACIFIC_COLORS.accent1 }}
                >
                  Add Pending PO
                </Button>
              </Box>
            </Box>

            {items.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary', bgcolor: '#f9f9f9', borderRadius: 1 }}>
                <Typography variant="body2">No line items added yet.</Typography>
                <Typography variant="caption">Click "Add With PO" or "Add Pending PO" above to add billable projects.</Typography>
              </Box>
            ) : (
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, width: '15%' }}>PO Status / No.</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: '20%' }}>Project / WBS</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: '35%' }}>Description & Completion</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: '15%', textAlign: 'right' }}>Amount (₱ VAT-EX)</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: '10%' }}>Footnote</TableCell>
                      <TableCell sx={{ width: '5%', textAlign: 'center' }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={item.id || idx}>
                        <TableCell>
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={item.hasPo}
                                onChange={(e) => handleUpdateItem(idx, { hasPo: e.target.checked })}
                              />
                            }
                            label={item.hasPo ? 'With PO' : 'Pending'}
                            sx={{ '& .MuiTypography-root': { fontSize: '0.75rem' }, display: 'block', mb: 0.5 }}
                          />
                          {item.hasPo ? (
                            <TextField
                              size="small"
                              placeholder="PO #"
                              value={item.poNumber || ''}
                              onChange={(e) => handleUpdateItem(idx, { poNumber: e.target.value })}
                              sx={{ input: { fontSize: '0.78rem', py: 0.5 } }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary">N/A</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            placeholder="e.g. Ebecor"
                            value={item.projectName}
                            onChange={(e) => handleUpdateItem(idx, { projectName: e.target.value })}
                            fullWidth
                            sx={{ input: { fontSize: '0.8rem', py: 0.5 } }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            placeholder="Scope / Description"
                            value={item.description}
                            onChange={(e) => handleUpdateItem(idx, { description: e.target.value })}
                            fullWidth
                            sx={{ input: { fontSize: '0.8rem', py: 0.5 }, mb: 0.5 }}
                          />
                          <TextField
                            size="small"
                            placeholder="e.g. Completion: March 2026"
                            value={item.completionDateText || ''}
                            onChange={(e) => handleUpdateItem(idx, { completionDateText: e.target.value })}
                            fullWidth
                            sx={{ input: { fontSize: '0.75rem', py: 0.3 } }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            type="number"
                            value={item.amount || ''}
                            onChange={(e) => handleUpdateItem(idx, { amount: parseFloat(e.target.value) || 0 })}
                            sx={{ input: { fontSize: '0.8rem', textAlign: 'right', py: 0.5 } }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            placeholder="* or **"
                            value={item.footnoteSymbol || ''}
                            onChange={(e) => handleUpdateItem(idx, { footnoteSymbol: e.target.value })}
                            sx={{ input: { fontSize: '0.75rem', py: 0.5 } }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <IconButton size="small" color="error" onClick={() => handleDeleteItem(idx)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Calculated Summary Totals */}
            <Box sx={{ mt: 2, p: 2, bgcolor: '#f4f7fb', borderRadius: 1 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 4 }}>
                  <Typography variant="caption" color="text.secondary">Sub-total (With PO):</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                    ₱{NUM(totals.subtotalWithPo)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Typography variant="caption" color="text.secondary">Sub-total (Pending PO):</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.accent1 }}>
                    ₱{NUM(totals.subtotalPendingPo)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4 }} sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">TOTAL OUTSTANDING (VAT-EX):</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                    ₱{NUM(totals.totalOutstanding)}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </Paper>

          {/* Footnotes & Explanations */}
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                3. Footnotes & Annotations
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={handleAddFootnote}>
                Add Footnote
              </Button>
            </Box>
            {footnotes.map((fn, idx) => (
              <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                <TextField
                  size="small"
                  label="Symbol"
                  value={fn.symbol}
                  onChange={(e) => handleUpdateFootnote(idx, { symbol: e.target.value })}
                  sx={{ width: 80, input: { fontSize: '0.8rem', py: 0.5 } }}
                />
                <TextField
                  size="small"
                  label="Footnote text"
                  value={fn.text}
                  onChange={(e) => handleUpdateFootnote(idx, { text: e.target.value })}
                  fullWidth
                  sx={{ input: { fontSize: '0.8rem', py: 0.5 } }}
                />
                <IconButton size="small" color="error" onClick={() => handleDeleteFootnote(idx)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Paper>

          {/* Signatory */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mb: 1.5 }}>
              4. Signatory (Prepared By)
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="Signatory Name"
                  value={preparedByName}
                  onChange={(e) => setPreparedByName(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="Signatory Title"
                  value={preparedByTitle}
                  onChange={(e) => setPreparedByTitle(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="Mobile Number"
                  value={preparedByPhone}
                  onChange={(e) => setPreparedByPhone(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="Email"
                  value={preparedByEmail}
                  onChange={(e) => setPreparedByEmail(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Grid>
            </Grid>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving}
          sx={{
            backgroundColor: NET_PACIFIC_COLORS.primary,
            '&:hover': { backgroundColor: NET_PACIFIC_COLORS.secondary },
          }}
        >
          {saving ? 'Saving...' : 'Save Statement of Account'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
