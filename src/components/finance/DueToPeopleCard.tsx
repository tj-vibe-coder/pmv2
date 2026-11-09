import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../config/api';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };

// What the company owes people who paid for company costs themselves:
// submitted claims still unpaid (less partial payments). Draft liquidations are
// shown apart because they are not a claim until submitted. Never netted against
// receivables such as the Belmont collection. Server: server/dueToPeople.js.

interface Person {
  employeeId: string | null; name: string | null; owed: number; draftTotal: number;
  claims: { id: string; formNo: string | null; remaining: number }[];
  drafts: { id: string; formNo: string | null; total: number }[];
}

const php = (n: number) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DueToPeopleCard: React.FC = () => {
  const navigate = useNavigate();
  // Portrait phones (< 600 px): the table becomes a compact list.
  const isPhone = useMediaQuery('(max-width:599.95px)');
  const [data, setData] = useState<{ people: Person[]; totalOwed: number; totalInDrafts: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('netpacific_token');
    fetch(`${API_BASE}/api/finance/due-to-people`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d); else setError(d.error || 'Could not load'); })
      .catch(() => setError('Could not load'));
  }, []);

  return (
    <Paper sx={{ borderRadius: 2, overflow: 'hidden', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0', mb: 3 }}>
      <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 1 }}>
        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flexGrow: 1 }}>
          Owed to people (paid from their own pocket)
        </Typography>
        <Button size="small" variant="outlined" onClick={() => navigate('/finance/reimbursements')} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>
          Pay claims
        </Button>
      </Box>
      <Box sx={{ p: 1.5 }}>
        {error && <Alert severity="warning">{error}</Alert>}
        {data && (data.people.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Nobody is owed anything.</Typography>
        ) : isPhone ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {data.people.map((p) => (
              <Paper key={p.employeeId || p.name || 'unknown'} variant="outlined" sx={{ p: 1.25, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{p.name || p.employeeId || 'Unknown'}</Typography>
                  {p.claims.length > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                      {p.claims.map((c) => c.formNo || 'claim').join(', ')}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{php(p.owed)}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {p.draftTotal ? `${php(p.draftTotal)} in draft` : 'no drafts'}
                  </Typography>
                </Box>
              </Paper>
            ))}
            <Paper variant="outlined" data-testid="due-total" sx={{ p: 1.25, bgcolor: '#f0f4f8', display: 'flex', justifyContent: 'space-between', gap: 1 }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>Total owed</Typography>
                <Typography variant="caption" color="text.secondary">{php(data.totalInDrafts)} still in drafts</Typography>
              </Box>
              <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{php(data.totalOwed)}</Typography>
            </Paper>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Person</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Owed (submitted claims)</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Still in draft</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.people.map((p) => (
                  <TableRow key={p.employeeId || p.name || 'unknown'}>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {p.name || p.employeeId || 'Unknown'}
                      <Typography variant="caption" display="block" color="text.secondary">
                        {p.claims.map((c) => c.formNo || 'claim').join(', ')}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }} align="right">{php(p.owed)}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }} align="right">{p.draftTotal ? php(p.draftTotal) : '—'}</TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ bgcolor: '#f0f4f8' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">{php(data.totalOwed)}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'text.secondary' }} align="right">{php(data.totalInDrafts)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        ))}
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Drafts become claims when submitted. Owners' capital is never repaid and is not listed. Shown on its own: incoming collections are not subtracted.
        </Typography>
      </Box>
    </Paper>
  );
};

export default DueToPeopleCard;
