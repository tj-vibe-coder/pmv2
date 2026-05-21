import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, Alert,
  Collapse, Tooltip, Radio,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  KeyboardArrowDown, KeyboardArrowRight, Star, StarBorder,
} from '@mui/icons-material';
import type { Client, ClientContact } from '../types/Client';
import { primaryContact } from '../types/Client';

const API_BASE = '/api';
const newContactId = () => Math.random().toString(36).slice(2, 10);

interface FormData {
  code: string;
  name: string;
  address: string;
  paymentTerms: string;
  am: string;
  contacts: ClientContact[];
}

const emptyForm: FormData = {
  code: '',
  name: '',
  address: '',
  paymentTerms: '',
  am: '',
  contacts: [
    { id: newContactId(), name: '', position: '', email: '', phone: '', gender: '', isPrimary: true },
  ],
};

const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/clients`);
      if (!res.ok) throw new Error('Failed to load clients');
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clients');
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClients(); }, []);

  const toggleExpand = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

  const handleOpenAdd = () => {
    setEditingClient(null);
    setFormData({ ...emptyForm, contacts: [{ id: newContactId(), name: '', position: '', email: '', phone: '', gender: '', isPrimary: true }] });
    setError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      code: client.code || '',
      name: client.name || '',
      address: client.address || '',
      paymentTerms: client.paymentTerms || '',
      am: client.am || '',
      contacts: client.contacts && client.contacts.length > 0
        ? client.contacts.map((c) => ({ ...c }))
        : [{ id: newContactId(), name: '', position: '', email: '', phone: '', gender: '', isPrimary: true }],
    });
    setError(null);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingClient(null);
    setFormData(emptyForm);
    setError(null);
  };

  const updateField = <K extends keyof Omit<FormData, 'contacts'>>(field: K, value: FormData[K]) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const updateContact = (idx: number, patch: Partial<ClientContact>) =>
    setFormData((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));

  const setPrimary = (idx: number) =>
    setFormData((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => ({ ...c, isPrimary: i === idx })),
    }));

  const addContact = () =>
    setFormData((prev) => ({
      ...prev,
      contacts: [
        ...prev.contacts,
        { id: newContactId(), name: '', position: '', email: '', phone: '', gender: '', isPrimary: false },
      ],
    }));

  const removeContact = (idx: number) =>
    setFormData((prev) => {
      const next = prev.contacts.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((c) => c.isPrimary)) next[0].isPrimary = true;
      return { ...prev, contacts: next };
    });

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('Client name is required');
      return;
    }
    // Ensure at least one contact has a name
    const cleanedContacts = formData.contacts
      .filter((c) => (c.name || '').trim().length > 0)
      .map((c) => ({ ...c, name: c.name.trim() }));
    if (cleanedContacts.length === 0) {
      setError('At least one contact with a name is required');
      return;
    }
    if (!cleanedContacts.some((c) => c.isPrimary)) cleanedContacts[0].isPrimary = true;

    const body = {
      code: formData.code.trim(),
      name: formData.name.trim(),
      address: formData.address.trim(),
      paymentTerms: formData.paymentTerms.trim(),
      am: formData.am.trim(),
      contacts: cleanedContacts,
    };

    setSubmitLoading(true);
    setError(null);
    try {
      const url = editingClient ? `${API_BASE}/clients/${editingClient.id}` : `${API_BASE}/clients`;
      const method = editingClient ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Request failed');
      }
      await loadClients();
      handleCloseDialog();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteClick = (client: Client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!clientToDelete) return;
    try {
      const res = await fetch(`${API_BASE}/clients/${clientToDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete client');
      await loadClients();
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>Clients</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAdd}
          sx={{ backgroundColor: '#2c5aa0', '&:hover': { backgroundColor: '#1e4a72' } }}
        >
          Add Client
        </Button>
      </Box>

      {error && !dialogOpen && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Paper sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ width: 36 }} />
                <TableCell sx={{ fontWeight: 600, width: 60 }}>Code</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Client Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Address</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Payment Terms</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Primary Contact</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Designation</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>AM</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} align="center">Loading...</TableCell></TableRow>
              ) : clients.length === 0 ? (
                <TableRow><TableCell colSpan={10} align="center">No clients yet. Click &quot;Add Client&quot; to add one.</TableCell></TableRow>
              ) : (
                clients.map((client) => {
                  const primary = primaryContact(client);
                  const extraCount = (client.contacts?.length ?? 0) - 1;
                  const open = !!expanded[client.id];
                  return (
                    <React.Fragment key={client.id}>
                      <TableRow hover>
                        <TableCell>
                          {extraCount > 0 ? (
                            <IconButton size="small" onClick={() => toggleExpand(client.id)} title={open ? 'Hide contacts' : `+${extraCount} more contact(s)`}>
                              {open ? <KeyboardArrowDown fontSize="small" /> : <KeyboardArrowRight fontSize="small" />}
                            </IconButton>
                          ) : null}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{client.code || '—'}</TableCell>
                        <TableCell>{client.name}</TableCell>
                        <TableCell sx={{ whiteSpace: 'pre-line', maxWidth: 280 }}>{client.address || '—'}</TableCell>
                        <TableCell>{client.paymentTerms || '—'}</TableCell>
                        <TableCell>{primary?.name || '—'}</TableCell>
                        <TableCell>{primary?.position || '—'}</TableCell>
                        <TableCell>{primary?.email || '—'}</TableCell>
                        <TableCell>{client.am || '—'}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => handleOpenEdit(client)} title="Edit"><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={() => handleDeleteClick(client)} color="error" title="Delete"><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                      {extraCount > 0 && (
                        <TableRow>
                          <TableCell sx={{ p: 0 }} colSpan={10}>
                            <Collapse in={open} unmountOnExit>
                              <Box sx={{ p: 1.5, pl: 6, backgroundColor: '#fafafa' }}>
                                <Typography variant="caption" color="text.secondary">Other contacts</Typography>
                                <Table size="small" sx={{ mt: 1 }}>
                                  <TableHead>
                                    <TableRow>
                                      <TableCell sx={{ fontSize: '0.7rem' }}>Name</TableCell>
                                      <TableCell sx={{ fontSize: '0.7rem' }}>Designation</TableCell>
                                      <TableCell sx={{ fontSize: '0.7rem' }}>Email</TableCell>
                                      <TableCell sx={{ fontSize: '0.7rem' }}>Phone</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {client.contacts.filter((c) => !c.isPrimary).map((c) => (
                                      <TableRow key={c.id}>
                                        <TableCell sx={{ fontSize: '0.8rem' }}>{c.name}</TableCell>
                                        <TableCell sx={{ fontSize: '0.8rem' }}>{c.position || '—'}</TableCell>
                                        <TableCell sx={{ fontSize: '0.8rem' }}>{c.email || '—'}</TableCell>
                                        <TableCell sx={{ fontSize: '0.8rem' }}>{c.phone || '—'}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingClient ? 'Edit Client' : 'Add Client'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField fullWidth label="Code" placeholder="e.g. ADI" value={formData.code} onChange={(e) => updateField('code', e.target.value.toUpperCase().slice(0, 4))} variant="outlined" size="small" />
            </Grid>
            <Grid size={{ xs: 12, sm: 9 }}>
              <TextField fullWidth required label="Client Name" value={formData.name} onChange={(e) => updateField('name', e.target.value)} variant="outlined" size="small" />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Address" value={formData.address} onChange={(e) => updateField('address', e.target.value)} variant="outlined" size="small" multiline rows={2} />
            </Grid>
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField fullWidth label="Payment Terms" placeholder="e.g. Net 30" value={formData.paymentTerms} onChange={(e) => updateField('paymentTerms', e.target.value)} variant="outlined" size="small" />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth label="Account Manager (IOCT)" value={formData.am} onChange={(e) => updateField('am', e.target.value)} variant="outlined" size="small" />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, mb: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>Contacts</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={addContact}>Add contact</Button>
              </Box>
              <Paper variant="outlined" sx={{ p: 1.5, backgroundColor: '#fafafa' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 40 }}>Primary</TableCell>
                      <TableCell>Name *</TableCell>
                      <TableCell>Designation</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Phone</TableCell>
                      <TableCell sx={{ width: 80 }}>Gender</TableCell>
                      <TableCell sx={{ width: 40 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {formData.contacts.map((c, idx) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Tooltip title="Set as primary">
                            <Radio
                              size="small"
                              checked={!!c.isPrimary}
                              onChange={() => setPrimary(idx)}
                              icon={<StarBorder fontSize="small" />}
                              checkedIcon={<Star fontSize="small" color="warning" />}
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <TextField value={c.name} onChange={(e) => updateContact(idx, { name: e.target.value })} variant="standard" size="small" fullWidth />
                        </TableCell>
                        <TableCell>
                          <TextField value={c.position ?? ''} onChange={(e) => updateContact(idx, { position: e.target.value })} variant="standard" size="small" fullWidth />
                        </TableCell>
                        <TableCell>
                          <TextField value={c.email ?? ''} onChange={(e) => updateContact(idx, { email: e.target.value })} variant="standard" size="small" fullWidth />
                        </TableCell>
                        <TableCell>
                          <TextField value={c.phone ?? ''} onChange={(e) => updateContact(idx, { phone: e.target.value })} variant="standard" size="small" fullWidth />
                        </TableCell>
                        <TableCell>
                          <TextField
                            select
                            value={c.gender ?? ''}
                            onChange={(e) => updateContact(idx, { gender: e.target.value as 'M' | 'F' | '' })}
                            variant="standard"
                            size="small"
                            fullWidth
                            SelectProps={{ native: true }}
                          >
                            <option value=""></option>
                            <option value="M">M</option>
                            <option value="F">F</option>
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => removeContact(idx)} disabled={formData.contacts.length === 1} title="Remove">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitLoading}>
            {submitLoading ? 'Saving...' : editingClient ? 'Update' : 'Add Client'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Client</DialogTitle>
        <DialogContent>
          {clientToDelete && (
            <Typography>
              Are you sure you want to delete <strong>{clientToDelete.name}</strong>? This cannot be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ClientsPage;
