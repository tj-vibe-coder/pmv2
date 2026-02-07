import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  Chip,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Collapse,
  Checkbox,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, ReceiptLong as CreateDRIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon } from '@mui/icons-material';
import dataService from '../services/dataService';
import { Project } from '../types/Project';

export const ORDER_TRACKER_STORAGE_KEY = 'orderTracker';
const STORAGE_KEY = ORDER_TRACKER_STORAGE_KEY;

export type OrderStatus = 'Draft' | 'Submitted' | 'Ordered' | 'In Transit' | 'Delivered';

export interface OrderItem {
  id: string;
  description: string;
  partNo: string;
  quantity: number;
  unit: string;
  notes: string;
  status: OrderStatus;
  supplier?: string;
  poNumber?: string;
}

export interface OrderRecord {
  id: string;
  orderNo: string;
  poNumber: string;
  supplier: string;
  projectId: number | null;
  projectName: string;
  orderDate: string;
  expectedDelivery: string;
  status: OrderStatus;
  itemsSummary: string;
  items?: OrderItem[];
  materialRequestId?: string; // set when order was created from a Material Request
  createdAt: string;
}

const statusColors: Record<OrderStatus, 'default' | 'primary' | 'info' | 'warning' | 'success'> = {
  Draft: 'default',
  Submitted: 'primary',
  Ordered: 'info',
  'In Transit': 'warning',
  Delivered: 'success',
};

const loadStored = (): OrderRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const saveStored = (list: OrderRecord[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
};

const OrderTrackerPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'All'>('All');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [supplier, setSupplier] = useState('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');
  const [status, setStatus] = useState<OrderStatus>('Draft');
  const [itemsDialogOrder, setItemsDialogOrder] = useState<OrderRecord | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  // orderId -> Set of item ids to include when creating DR
  const [selectedForDR, setSelectedForDR] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    dataService.getProjects().then(setProjects);
    setOrders(loadStored());
  }, []);

  const selectedProject = projects.find((p) => p.id === projectId);
  const projectName = selectedProject?.project_name ?? '';

  const filteredOrders = statusFilter === 'All'
    ? orders
    : orders.filter((o) => o.status === statusFilter);

  const handleOpenAdd = () => {
    setOrderNo('');
    setPoNumber('');
    setSupplier('');
    setProjectId('');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDelivery('');
    setItemsSummary('');
    setStatus('Draft');
    setDialogOpen(true);
  };

  const handleCloseDialog = () => setDialogOpen(false);

  const handleAddOrder = () => {
    const no = orderNo.trim() || `ORD-${Date.now()}`;
    const order: OrderRecord = {
      id: `order-${Date.now()}`,
      orderNo: no,
      poNumber: poNumber.trim(),
      supplier: supplier.trim(),
      projectId: projectId === '' ? null : Number(projectId),
      projectName: projectName || '—',
      orderDate: orderDate,
      expectedDelivery: expectedDelivery.trim() || '—',
      status,
      itemsSummary: itemsSummary.trim() || '—',
      createdAt: new Date().toISOString(),
    };
    const next = [order, ...orders];
    setOrders(next);
    saveStored(next);
    handleCloseDialog();
  };

  const handleStatusChange = (id: string, newStatus: OrderStatus) => {
    const next = orders.map((o) => (o.id === id ? { ...o, status: newStatus } : o));
    setOrders(next);
    saveStored(next);
  };

  const handleDeleteOrder = (id: string) => {
    if (!window.confirm('Delete this order? This cannot be undone.')) return;
    const next = orders.filter((o) => o.id !== id);
    setOrders(next);
    saveStored(next);
    if (itemsDialogOrder?.id === id) setItemsDialogOrder(null);
  };

  const handleItemStatusChange = (orderId: string, itemId: string, newStatus: OrderStatus) => {
    const next = orders.map((o) => {
      if (o.id !== orderId || !o.items) return o;
      return {
        ...o,
        items: o.items.map((it) => (it.id === itemId ? { ...it, status: newStatus } : it)),
      };
    });
    setOrders(next);
    saveStored(next);
    setItemsDialogOrder((prev) => {
      if (!prev || prev.id !== orderId) return prev;
      const updated = next.find((o) => o.id === orderId);
      return updated ?? prev;
    });
  };

  const handleItemFieldChange = (orderId: string, itemId: string, field: 'supplier' | 'poNumber', value: string) => {
    const next = orders.map((o) => {
      if (o.id !== orderId || !o.items) return o;
      return {
        ...o,
        items: o.items.map((it) => (it.id === itemId ? { ...it, [field]: value } : it)),
      };
    });
    setOrders(next);
    saveStored(next);
    setItemsDialogOrder((prev) => {
      if (!prev || prev.id !== orderId) return prev;
      const updated = next.find((o) => o.id === orderId);
      return updated ?? prev;
    });
  };

  const toggleExpand = (orderId: string) => {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId));
  };

  const toggleItemForDR = (orderId: string, itemId: string) => {
    setSelectedForDR((prev) => {
      const set = new Set(prev[orderId] ?? []);
      if (set.has(itemId)) set.delete(itemId);
      else set.add(itemId);
      const next = { ...prev };
      if (set.size) next[orderId] = set;
      else delete next[orderId];
      return next;
    });
  };

  const getDRUrlWithSelected = (orderId: string): string => {
    const ids = selectedForDR[orderId];
    if (!ids || ids.size === 0) return `/delivery?orderId=${orderId}`;
    return `/delivery?orderId=${orderId}&itemIds=${Array.from(ids).join(',')}`;
  };

  const selectedCount = (orderId: string) => (selectedForDR[orderId]?.size ?? 0);

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#2c5aa0', mb: 2 }}>
        Order Tracker
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e: SelectChangeEvent<OrderStatus | 'All'>) => setStatusFilter(e.target.value as OrderStatus | 'All')}
          >
            <MenuItem value="All">All</MenuItem>
            <MenuItem value="Draft">Draft</MenuItem>
            <MenuItem value="Submitted">Submitted</MenuItem>
            <MenuItem value="Ordered">Ordered</MenuItem>
            <MenuItem value="In Transit">In Transit</MenuItem>
            <MenuItem value="Delivered">Delivered</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>
          Add order
        </Button>
      </Box>

      <Paper sx={{ borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: 40 }} />
                <TableCell sx={{ fontWeight: 600 }}>Order No.</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>PO Number</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Supplier</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Project</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Order Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Expected Delivery</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Items summary</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Update status</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {orders.length === 0
                      ? 'No orders yet. Add an order to track.'
                      : `No orders with status "${statusFilter}".`}
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((o) => (
                  <React.Fragment key={o.id}>
                    <TableRow hover sx={{ cursor: 'default' }}>
                      <TableCell sx={{ width: 40, py: 0, verticalAlign: 'middle' }} onClick={(e) => e.stopPropagation()}>
                        {o.items && o.items.length > 0 ? (
                          <IconButton
                            size="small"
                            onClick={() => toggleExpand(o.id)}
                            aria-label={expandedOrderId === o.id ? 'Collapse items' : 'Expand items'}
                            sx={{ p: 0.25 }}
                          >
                            {expandedOrderId === o.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        ) : null}
                      </TableCell>
                      <TableCell
                        sx={{ cursor: o.items && o.items.length > 0 ? 'pointer' : 'default' }}
                        onDoubleClick={() => o.items && o.items.length > 0 && setItemsDialogOrder(o)}
                      >
                        {o.orderNo}
                        {o.materialRequestId && (
                          <Chip size="small" label="From MRF" sx={{ ml: 0.5 }} color="primary" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>{o.poNumber || '—'}</TableCell>
                      <TableCell>{o.supplier || '—'}</TableCell>
                      <TableCell>{o.projectName}</TableCell>
                      <TableCell>{o.orderDate}</TableCell>
                      <TableCell>{o.expectedDelivery}</TableCell>
                      <TableCell>
                        <Chip label={o.status} size="small" color={statusColors[o.status]} variant="outlined" />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180 }} title={o.itemsSummary}>
                        <Typography variant="body2" noWrap>
                          {o.itemsSummary || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Select
                          size="small"
                          value={o.status}
                          onChange={(e) => handleStatusChange(o.id, e.target.value as OrderStatus)}
                          sx={{ minWidth: 120 }}
                        >
                          <MenuItem value="Draft">Draft</MenuItem>
                          <MenuItem value="Submitted">Submitted</MenuItem>
                          <MenuItem value="Ordered">Ordered</MenuItem>
                          <MenuItem value="In Transit">In Transit</MenuItem>
                          <MenuItem value="Delivered">Delivered</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton
                          size="small"
                          onClick={() => navigate(getDRUrlWithSelected(o.id))}
                          title={selectedCount(o.id) > 0 ? `Create DR with ${selectedCount(o.id)} selected item(s)` : 'Create Delivery Receipt from this order'}
                          sx={{ color: '#2c5aa0' }}
                        >
                          <CreateDRIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteOrder(o.id)}
                          title="Delete order"
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={11} sx={{ py: 0, borderBottom: expandedOrderId === o.id ? '1px solid #e2e8f0' : 'none' }}>
                        <Collapse in={expandedOrderId === o.id} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 1.5, px: 1, bgcolor: 'grey.50' }}>
                            {o.items && o.items.length > 0 ? (
                              <>
                                <TableContainer>
                                  <Table size="small" sx={{ '& .MuiTableCell-root': { borderColor: 'divider' } }}>
                                    <TableHead>
                                      <TableRow>
                                        <TableCell sx={{ width: 48, fontWeight: 600 }}>Deliver now</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>No.</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Item / Description</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Part #</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>Qty</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Unit</TableCell>
                                        <TableCell sx={{ fontWeight: 600, minWidth: 130 }}>Status</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {o.items.map((item, idx) => (
                                        <TableRow key={item.id}>
                                          <TableCell sx={{ width: 48 }}>
                                            <Checkbox
                                              size="small"
                                              checked={(selectedForDR[o.id] ?? new Set()).has(item.id)}
                                              onChange={() => toggleItemForDR(o.id, item.id)}
                                              title="Include in next Delivery Receipt"
                                            />
                                          </TableCell>
                                          <TableCell>{idx + 1}</TableCell>
                                          <TableCell>{item.description || '—'}</TableCell>
                                          <TableCell>{item.partNo || '—'}</TableCell>
                                          <TableCell align="right">{item.quantity}</TableCell>
                                          <TableCell>{item.unit || '—'}</TableCell>
                                          <TableCell>
                                            <Select
                                              size="small"
                                              fullWidth
                                              value={item.status}
                                              onChange={(e) => handleItemStatusChange(o.id, item.id, e.target.value as OrderStatus)}
                                              sx={{ minWidth: 120 }}
                                            >
                                              <MenuItem value="Draft">Draft</MenuItem>
                                              <MenuItem value="Submitted">Submitted</MenuItem>
                                              <MenuItem value="Ordered">Ordered</MenuItem>
                                              <MenuItem value="In Transit">In Transit</MenuItem>
                                              <MenuItem value="Delivered">Delivered</MenuItem>
                                            </Select>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<CreateDRIcon />}
                                    onClick={() => navigate(getDRUrlWithSelected(o.id))}
                                    sx={{ color: '#2c5aa0', borderColor: '#2c5aa0' }}
                                  >
                                    {selectedCount(o.id) > 0 ? `Create DR with selected (${selectedCount(o.id)})` : 'Create DR (all items)'}
                                  </Button>
                                  <Typography variant="caption" color="text.secondary">
                                    Double‑click order row to edit Supplier / PO per item
                                  </Typography>
                                </Box>
                              </>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                No line items. {o.itemsSummary ? `Summary: ${o.itemsSummary}` : 'Double‑click to add items or add via Material Request.'}
                              </Typography>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Add Order Dialog */}
      <Paper
        component="form"
        sx={{
          display: dialogOpen ? 'block' : 'none',
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1300,
          p: 3,
          borderRadius: 2,
          boxShadow: 24,
          maxWidth: 480,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <Typography variant="h6" sx={{ mb: 2 }}>
          Add order
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" label="Order No." value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="Auto if blank" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" label="PO Number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth size="small" label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              select
              size="small"
              label="Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <MenuItem value="">— Select —</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.project_name}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
              <MenuItem value="Draft">Draft</MenuItem>
              <MenuItem value="Submitted">Submitted</MenuItem>
              <MenuItem value="Ordered">Ordered</MenuItem>
              <MenuItem value="In Transit">In Transit</MenuItem>
              <MenuItem value="Delivered">Delivered</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" type="date" label="Order Date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth size="small" type="date" label="Expected Delivery" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth size="small" label="Items summary" value={itemsSummary} onChange={(e) => setItemsSummary(e.target.value)} multiline rows={2} placeholder="Brief description of items" />
          </Grid>
        </Grid>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleAddOrder} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>
            Add order
          </Button>
        </Box>
      </Paper>

      {dialogOpen && (
        <Box
          onClick={handleCloseDialog}
          sx={{
            position: 'fixed',
            inset: 0,
            bgcolor: 'rgba(0,0,0,0.5)',
            zIndex: 1299,
          }}
        />
      )}

      <Dialog open={!!itemsDialogOrder} onClose={() => setItemsDialogOrder(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ borderBottom: '1px solid #e2e8f0', pb: 1 }}>
          Order items – {itemsDialogOrder?.orderNo}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {itemsDialogOrder && (
            <Box>
              {itemsDialogOrder.items && itemsDialogOrder.items.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>No.</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Item / Description</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Part #</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Qty</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Unit</TableCell>
                        <TableCell sx={{ fontWeight: 600, minWidth: 140 }}>Supplier</TableCell>
                        <TableCell sx={{ fontWeight: 600, minWidth: 120 }}>PO Number</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Notes</TableCell>
                        <TableCell sx={{ fontWeight: 600, minWidth: 130 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {itemsDialogOrder.items.map((item, idx) => (
                        <TableRow key={item.id}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{item.description || '—'}</TableCell>
                          <TableCell>{item.partNo || '—'}</TableCell>
                          <TableCell align="right">{item.quantity}</TableCell>
                          <TableCell>{item.unit || '—'}</TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              placeholder="Supplier"
                              value={item.supplier ?? ''}
                              onChange={(e) => handleItemFieldChange(itemsDialogOrder.id, item.id, 'supplier', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              placeholder="PO #"
                              value={item.poNumber ?? ''}
                              onChange={(e) => handleItemFieldChange(itemsDialogOrder.id, item.id, 'poNumber', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>{item.notes || '—'}</TableCell>
                          <TableCell>
                            <Select
                              size="small"
                              fullWidth
                              value={item.status}
                              onChange={(e) => handleItemStatusChange(itemsDialogOrder.id, item.id, e.target.value as OrderStatus)}
                            >
                              <MenuItem value="Draft">Draft</MenuItem>
                              <MenuItem value="Submitted">Submitted</MenuItem>
                              <MenuItem value="Ordered">Ordered</MenuItem>
                              <MenuItem value="In Transit">In Transit</MenuItem>
                              <MenuItem value="Delivered">Delivered</MenuItem>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  No line items. {itemsDialogOrder.itemsSummary ? `Summary: ${itemsDialogOrder.itemsSummary}` : 'This order was added manually or has no items.'}
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid #e2e8f0', p: 2 }}>
          <Button onClick={() => setItemsDialogOrder(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrderTrackerPage;
