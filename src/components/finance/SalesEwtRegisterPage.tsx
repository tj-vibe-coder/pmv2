import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Grid, Paper, Typography, Card, CardContent, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Chip, Alert, CircularProgress, Button,
} from '@mui/material';
import type { ProjectInvoice } from '../../types/Invoice';
import { invoiceCash, invoiceWht } from '../../types/Invoice';
import { API_BASE } from '../../config/api';

const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
  accent1: '#4f7bc8',
  accent2: '#3c6ba5',
  success: '#00b894',
  warning: '#fdcb6e',
  error: '#e84393',
  info: '#74b9ff',
};

const PHP = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
const API = `${API_BASE}/api`;

export default function SalesEwtRegisterPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/invoices`)
      .then((r) => { if (!r.ok) throw new Error('Failed to load invoices'); return r.json(); })
      .then((rows: ProjectInvoice[]) => setInvoices(Array.isArray(rows) ? rows : []))
      .catch(() => setError('Failed to load invoices.'))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(
    () => invoices.filter((i) => invoiceWht(i) > 0)
      .sort((a, b) => String(b.invoice_date || '').localeCompare(String(a.invoice_date || ''))),
    [invoices],
  );

  const summary = useMemo(() => {
    const totalWht = rows.reduce((s, i) => s + invoiceWht(i), 0);
    const totalGross = rows.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const expected = rows.filter((i) => i.wht_2307_status !== 'received').length;
    const received = rows.filter((i) => i.wht_2307_status === 'received').length;
    return { totalWht, totalGross, expected, received };
  }, [rows]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Sales EWT / BIR 2307
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => navigate('/finance/collections')}
          sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
        >
          Collections
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
      <Alert severity="info" sx={{ mb: 1.5 }}>
        Customer withholding is a tax credit, not cash and not a sales discount.
        Certificates stay <strong>expected</strong> until the 2307 is on file.
        The 3% percentage-tax filing basis is not automated here.
      </Alert>

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>EWT withheld</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {PHP.format(summary.totalWht)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{rows.length} invoice{rows.length !== 1 ? 's' : ''}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent2} 0%, ${NET_PACIFIC_COLORS.secondary} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Gross SI with EWT</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {PHP.format(summary.totalGross)}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Billed, not cash</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>2307 expected</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {summary.expected}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Amount recorded, form not filed here</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>2307 received</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {summary.received}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>Certificate on file</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
        <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
            Register ({rows.length})
          </Typography>
        </Box>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>SI / Date</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Sold to</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Project</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Gross sales</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>EWT</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Rate</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Cash</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>2307</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No customer EWT recorded yet. Add WHT on an invoice in Collections.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((inv) => (
                <TableRow key={inv.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{inv.invoice_no}</Typography>
                    <Typography variant="caption" color="text.secondary">{inv.invoice_date}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{inv.bill_to_name || (inv.bill_to === 'acti' ? 'ACTI' : '—')}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: '0.8rem', color: NET_PACIFIC_COLORS.primary, cursor: 'pointer' }}
                      onClick={() => navigate(`/finance/collections?project_id=${encodeURIComponent(String(inv.project_id))}`)}
                    >
                      {inv.project_no || inv.project_name || inv.project_id}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{PHP.format(inv.amount)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap', fontWeight: 600 }}>{PHP.format(invoiceWht(inv))}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                    {inv.wht_rate_pct ? `${inv.wht_rate_pct}%` : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{PHP.format(invoiceCash(inv))}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={inv.wht_2307_status === 'received' ? 'success' : 'warning'}
                      label={inv.wht_2307_status === 'received' ? 'Received' : 'Expected'}
                    />
                    {inv.wht_2307_ref && (
                      <Typography variant="caption" display="block" color="text.secondary">{inv.wht_2307_ref}</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
