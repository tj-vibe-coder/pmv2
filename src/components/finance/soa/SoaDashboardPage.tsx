import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  TextField,
  MenuItem,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useSoaStore } from '../../../store/soaStore';
import type { StatementOfAccount, SoaStatus } from '../../../types/StatementOfAccount';
import { soaStatusLabel, computeSoaTotals } from '../../../types/StatementOfAccount';
import { downloadSoaPdf } from '../../../utils/soa/soaPdfExport';
import SoaEditorDialog from './SoaEditorDialog';
import SoaPdfPreviewDialog from './SoaPdfPreviewDialog';

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

const NUM = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function SoaDashboardPage() {
  const navigate = useNavigate();

  const soas = useSoaStore((s) => s.soas);
  const loading = useSoaStore((s) => s.loading);
  const error = useSoaStore((s) => s.error);
  const fetchSoas = useSoaStore((s) => s.fetchSoas);
  const saveSoa = useSoaStore((s) => s.saveSoa);
  const removeSoa = useSoaStore((s) => s.removeSoa);

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRecipient, setFilterRecipient] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSoa, setEditingSoa] = useState<StatementOfAccount | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSoa, setPreviewSoa] = useState<StatementOfAccount | null>(null);

  useEffect(() => {
    void fetchSoas();
  }, [fetchSoas]);

  // Filtered SOAs
  const filteredSoas = useMemo(() => {
    return soas.filter((soa) => {
      if (filterStatus !== 'all' && soa.status !== filterStatus) return false;
      if (filterRecipient !== 'all' && soa.recipientCode !== filterRecipient) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNo = (soa.soaNo || '').toLowerCase().includes(q);
        const matchesClient = (soa.recipientName || '').toLowerCase().includes(q);
        const matchesSubject = (soa.subject || '').toLowerCase().includes(q);
        const matchesItem = (soa.items || []).some(
          (it) =>
            (it.projectName || '').toLowerCase().includes(q) ||
            (it.poNumber || '').toLowerCase().includes(q) ||
            (it.description || '').toLowerCase().includes(q)
        );
        if (!matchesNo && !matchesClient && !matchesSubject && !matchesItem) return false;
      }
      return true;
    });
  }, [soas, filterStatus, filterRecipient, searchQuery]);

  // Aggregate KPI Calculations
  const metrics = useMemo(() => {
    let totalOutstanding = 0;
    let totalWithPo = 0;
    let totalPendingPo = 0;
    let totalSettled = 0;
    let openCount = 0;

    for (const s of soas) {
      const t = computeSoaTotals(s.items || []);
      if (s.status === 'settled') {
        totalSettled += t.totalOutstanding;
      } else {
        totalOutstanding += t.totalOutstanding;
        totalWithPo += t.subtotalWithPo;
        totalPendingPo += t.subtotalPendingPo;
        openCount++;
      }
    }

    return {
      totalOutstanding,
      totalWithPo,
      totalPendingPo,
      totalSettled,
      openCount,
    };
  }, [soas]);

  const handleOpenNew = () => {
    setEditingSoa(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (soa: StatementOfAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSoa(soa);
    setEditorOpen(true);
  };

  const handleOpenPreview = (soa: StatementOfAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewSoa(soa);
    setPreviewOpen(true);
  };

  const handleDownload = (soa: StatementOfAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    void downloadSoaPdf(soa);
  };

  const handleDelete = async (soa: StatementOfAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete ${soa.soaNo}?`)) {
      await removeSoa(soa.id);
    }
  };

  const getStatusColor = (status: SoaStatus) => {
    switch (status) {
      case 'settled':
        return 'success';
      case 'for_payment':
        return 'primary';
      case 'partially_paid':
        return 'warning';
      case 'draft':
        return 'default';
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: 3 }}>
      {/* Page Title */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <ReceiptLongIcon sx={{ mr: 1.5, color: NET_PACIFIC_COLORS.primary, fontSize: 32 }} />
        <Typography variant="h4" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
          Statements of Account
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* KPI Cards Grid */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper
            elevation={1}
            sx={{
              p: 2.5,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.secondary} 100%)`,
              color: 'white',
            }}
          >
            <Typography variant="body2" sx={{ opacity: 0.9 }}>TOTAL OUTSTANDING (VAT-EX)</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>₱{NUM(metrics.totalOutstanding)}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>{metrics.openCount} open statements</Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper
            elevation={1}
            sx={{
              p: 2.5,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.accent1} 0%, ${NET_PACIFIC_COLORS.accent2} 100%)`,
              color: 'white',
            }}
          >
            <Typography variant="body2" sx={{ opacity: 0.9 }}>WITH PURCHASE ORDER</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>₱{NUM(metrics.totalWithPo)}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>Formal POs confirmed</Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper
            elevation={1}
            sx={{
              p: 2.5,
              borderRadius: 2,
              background: `linear-gradient(135deg, #e67e22 0%, #d35400 100%)`,
              color: 'white',
            }}
          >
            <Typography variant="body2" sx={{ opacity: 0.9 }}>PENDING PURCHASE ORDER</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>₱{NUM(metrics.totalPendingPo)}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>Work rendered / awaiting PO</Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper
            elevation={1}
            sx={{
              p: 2.5,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #00a884 100%)`,
              color: 'white',
            }}
          >
            <Typography variant="body2" sx={{ opacity: 0.9 }}>TOTAL SETTLED</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5 }}>₱{NUM(metrics.totalSettled)}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>Payments recorded & cleared</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Filters Paper */}
      <Paper elevation={1} sx={{ p: 1.5, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField
              size="small"
              placeholder="Search by SOA #, client, project, or PO number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              size="small"
              select
              label="Status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              fullWidth
            >
              <MenuItem value="all">All Statuses</MenuItem>
              <MenuItem value="for_payment">For Payment</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="partially_paid">Partially Paid</MenuItem>
              <MenuItem value="settled">Settled</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField
              size="small"
              select
              label="Recipient"
              value={filterRecipient}
              onChange={(e) => setFilterRecipient(e.target.value)}
              fullWidth
            >
              <MenuItem value="all">All Recipients</MenuItem>
              <MenuItem value="ACT">Advance Controle Technologie Inc (ACT)</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Table Section */}
      <Paper elevation={1}>
        {/* Table Header Bar */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            bgcolor: NET_PACIFIC_COLORS.primary,
            color: 'white',
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Statements of Account ({filteredSoas.length})
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleOpenNew}
            sx={{
              bgcolor: '#ffffff',
              color: NET_PACIFIC_COLORS.primary,
              fontWeight: 700,
              '&:hover': { bgcolor: '#f0f4f8' },
            }}
          >
            New Statement of Account
          </Button>
        </Box>

        {loading && soas.length === 0 ? (
          <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : filteredSoas.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body1">No Statements of Account found matching filters.</Typography>
            <Typography variant="caption">Click "New Statement of Account" above to create your first statement.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>SOA Ref No.</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Recipient</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Subject</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Items</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>With PO (₱)</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Pending PO (₱)</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Total Outstanding (₱)</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSoas.map((soa) => {
                  const totals = computeSoaTotals(soa.items || []);
                  const withPoCount = (soa.items || []).filter((i) => i.hasPo).length;
                  const pendingPoCount = (soa.items || []).filter((i) => !i.hasPo).length;

                  return (
                    <TableRow
                      key={soa.id}
                      hover
                      onClick={() => navigate(`/finance/soa/${soa.id}`)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                        {soa.soaNo}
                      </TableCell>
                      <TableCell>{soa.date}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{soa.recipientName}</TableCell>
                      <TableCell sx={{ maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {soa.subject}
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {withPoCount} PO · {pendingPoCount} pending
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        ₱{NUM(totals.subtotalWithPo)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: '#e67e22' }}>
                        ₱{NUM(totals.subtotalPendingPo)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary }}>
                        ₱{NUM(totals.totalOutstanding)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={soaStatusLabel(soa.status)}
                          color={getStatusColor(soa.status) as any}
                          size="small"
                          sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Preview PDF">
                          <IconButton size="small" onClick={(e) => handleOpenPreview(soa, e)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download PDF">
                          <IconButton size="small" onClick={(e) => handleDownload(soa, e)}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit SOA">
                          <IconButton size="small" onClick={(e) => handleOpenEdit(soa, e)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={(e) => handleDelete(soa, e)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Editor & Preview Modals */}
      <SoaEditorDialog
        open={editorOpen}
        soa={editingSoa}
        onClose={() => setEditorOpen(false)}
        onSave={async (payload) => {
          await saveSoa(payload);
        }}
      />

      <SoaPdfPreviewDialog
        open={previewOpen}
        soa={previewSoa}
        onClose={() => setPreviewOpen(false)}
      />
    </Box>
  );
}
