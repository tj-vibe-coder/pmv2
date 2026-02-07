import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  MenuItem,
  Box,
  Typography,
  Divider,
  Alert,
  CircularProgress,
  Paper,
} from '@mui/material';
import { Save as SaveIcon, Edit as EditIcon } from '@mui/icons-material';
import dataService from '../services/dataService';
import { Project } from '../types/Project';
import { Client } from '../types/Client';

const API_BASE = '/api';

interface EditProjectDialogProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onSaved: (updatedProject: Project) => void;
}

const categoryOptions = ['Services', 'Electrical', 'PLC/SCADA', 'BMS'];

const statusPercentToProjectStatus = (p: number): string => {
  if (p <= 0) return 'Not Started';
  if (p >= 100) return 'Completed';
  return 'In Progress';
};

const unixToDateInput = (unix: number | null | undefined): string => {
  if (unix == null) return '';
  const d = new Date(unix * 1000);
  return d.toISOString().slice(0, 10);
};

const EditProjectDialog: React.FC<EditProjectDialogProps> = ({ open, project, onClose, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    project_no: '',
    project_name: '',
    account_name: '',
    year: new Date().getFullYear(),
    project_category: '',
    project_location: '',
    scope_of_work: '',
    contract_amount: 0,
    updated_contract_amount: 0,
    status_percent: 0,
    po_number: '',
    po_date: '',
    client_status: '',
    down_payment_percent: 0.1,
    retention_percent: 0.1,
    duration_days: 90,
    payment_schedule: '10%, 80%, 10%',
    payment_terms: '30',
    bonds_requirement: 'NO',
    client_approver: '',
    progress_billing_schedule: 'Monthly',
  });

  useEffect(() => {
    if (open) {
      setClientsLoading(true);
      fetch(`${API_BASE}/clients`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setClients(Array.isArray(data) ? data : []))
        .catch(() => setClients([]))
        .finally(() => setClientsLoading(false));
    }
  }, [open]);

  useEffect(() => {
    if (open && project) {
      setFormData({
        project_no: project.project_no || '',
        project_name: project.project_name || '',
        account_name: project.account_name || '',
        year: project.year || new Date().getFullYear(),
        project_category: project.project_category || '',
        project_location: project.project_location || '',
        scope_of_work: project.scope_of_work || '',
        contract_amount: project.contract_amount || 0,
        updated_contract_amount: project.updated_contract_amount || 0,
        status_percent: project.actual_site_progress_percent ?? 0,
        po_number: project.po_number || '',
        po_date: unixToDateInput(project.po_date),
        client_status: project.client_status || '',
        down_payment_percent: project.down_payment_percent ?? 0.1,
        retention_percent: project.retention_percent ?? 0.1,
        duration_days: project.duration_days || 90,
        payment_schedule: project.payment_schedule || '10%, 80%, 10%',
        payment_terms: project.payment_terms || '30',
        bonds_requirement: project.bonds_requirement || 'NO',
        client_approver: project.client_approver || '',
        progress_billing_schedule: project.progress_billing_schedule || 'Monthly',
      });
    }
  }, [open, project]);

  useEffect(() => {
    if (open && project && clients.length > 0) {
      const client = clients.find((c) => c.client_name === project.account_name) || null;
      setSelectedClient(client);
    } else if (!open) {
      setSelectedClient(null);
    }
  }, [open, project, clients]);

  const handleClientSelect = (clientId: string) => {
    const id = clientId ? Number(clientId) : 0;
    const client = clients.find((c) => c.id === id) || null;
    setSelectedClient(client);
    if (client) {
      setFormData((prev) => ({
        ...prev,
        account_name: client.client_name,
        payment_terms: client.payment_terms || prev.payment_terms,
        client_approver: client.contact_person ? [client.contact_person, client.designation].filter(Boolean).join(' – ') : prev.client_approver,
        project_location: client.address || prev.project_location,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        account_name: '',
        client_approver: prev.client_approver,
      }));
    }
    setError(null);
  };

  const handleInputChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFormData((prev) => ({
      ...prev,
      [field]:
        field.includes('amount') || field.includes('percent') || field === 'duration_days' || field === 'year'
          ? Number(value) || 0
          : value,
    }));
    setError(null);
  };
  const clampStatusPercent = (n: number) => Math.min(100, Math.max(0, n));

  const handleSubmit = async () => {
    if (!project) return;
    if (!formData.project_name.trim()) {
      setError('Project name is required');
      return;
    }
    if (!formData.account_name.trim()) {
      setError('Client is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const poDateUnix = formData.po_date
        ? Math.floor(new Date(formData.po_date).getTime() / 1000)
        : (project.po_date ?? null);
      const payload: Partial<Project> = {
        project_no: formData.project_no || undefined,
        project_name: formData.project_name,
        account_name: formData.account_name,
        year: formData.year,
        project_category: formData.project_category,
        project_location: formData.project_location,
        scope_of_work: formData.scope_of_work,
        contract_amount: formData.contract_amount,
        updated_contract_amount: formData.updated_contract_amount,
        actual_site_progress_percent: clampStatusPercent(formData.status_percent),
        project_status: statusPercentToProjectStatus(formData.status_percent),
        po_number: formData.po_number,
        po_date: formData.po_date ? poDateUnix : null,
        start_date: formData.po_date ? poDateUnix : project.start_date,
        client_status: formData.client_status,
        down_payment_percent: formData.down_payment_percent,
        retention_percent: formData.retention_percent,
        duration_days: formData.duration_days,
        payment_schedule: formData.payment_schedule,
        payment_terms: formData.payment_terms,
        bonds_requirement: formData.bonds_requirement,
        client_approver: formData.client_approver,
        progress_billing_schedule: formData.progress_billing_schedule,
      };

      const result = await dataService.updateProject(project.id, payload);

      if (result.success) {
        setSuccess(true);
        const updated = await dataService.getProject(project.id);
        setTimeout(() => {
          if (updated) onSaved(updated);
          onClose();
        }, 800);
      } else {
        setError(result.error || 'Failed to update project');
      }
    } catch (err) {
      setError('An error occurred while updating the project');
      console.error('Error updating project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  if (!project) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2, maxHeight: '90vh' } }}>
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <EditIcon color="primary" />
        <Typography variant="h6" component="span">
          Edit Project
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Project updated successfully.
          </Alert>
        )}

        <Box component="form" noValidate>
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: '#1a202c' }}>
            Basic Information
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Project No." value={formData.project_no} onChange={handleInputChange('project_no')} variant="outlined" size="small" placeholder="e.g. P-2024-001" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth required label="Project Name *" value={formData.project_name} onChange={handleInputChange('project_name')} variant="outlined" size="small" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                required
                label="Client *"
                value={selectedClient?.id ?? ''}
                onChange={(e) => handleClientSelect(e.target.value)}
                variant="outlined"
                size="small"
                disabled={clientsLoading}
                helperText={clientsLoading ? 'Loading clients...' : 'Select a client'}
              >
                <MenuItem value="">
                  <em>— Select client —</em>
                </MenuItem>
                {clients.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.client_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {selectedClient && (
              <Grid size={{ xs: 12 }}>
                <Paper variant="outlined" sx={{ p: 2, backgroundColor: '#f8fafc' }}>
                  <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 1 }}>
                    Client details
                  </Typography>
                  <Grid container spacing={1.5}>
                    {selectedClient.address && (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="body2"><strong>Address:</strong> {selectedClient.address}</Typography>
                      </Grid>
                    )}
                    {selectedClient.payment_terms && (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="body2"><strong>Payment terms:</strong> {selectedClient.payment_terms}</Typography>
                      </Grid>
                    )}
                    {(selectedClient.contact_person || selectedClient.designation) && (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="body2"><strong>Contact:</strong> {[selectedClient.contact_person, selectedClient.designation].filter(Boolean).join(' – ')}</Typography>
                      </Grid>
                    )}
                    {selectedClient.email_address && (
                      <Grid size={{ xs: 12 }}>
                        <Typography variant="body2"><strong>Email:</strong> {selectedClient.email_address}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </Paper>
              </Grid>
            )}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Year" type="number" value={formData.year} onChange={handleInputChange('year')} variant="outlined" size="small" inputProps={{ min: 2000, max: 2030 }} />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: '#1a202c' }}>
            Project Details
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth select label="Project Category" value={formData.project_category} onChange={handleInputChange('project_category')} variant="outlined" size="small">
                {categoryOptions.map((cat) => (
                  <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Location / Address" value={formData.project_location} onChange={handleInputChange('project_location')} variant="outlined" size="small" placeholder="Region or full address" />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Scope of Work" value={formData.scope_of_work} onChange={handleInputChange('scope_of_work')} variant="outlined" size="small" multiline rows={2} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Status (%)" type="number" value={formData.status_percent} onChange={handleInputChange('status_percent')} variant="outlined" size="small" inputProps={{ min: 0, max: 100, step: 1 }} helperText="0–100%" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Duration (Days)" type="number" value={formData.duration_days} onChange={handleInputChange('duration_days')} variant="outlined" size="small" inputProps={{ min: 1 }} />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: '#1a202c' }}>
            Financial Information
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Contract Amount" type="number" value={formData.contract_amount} onChange={handleInputChange('contract_amount')} variant="outlined" size="small" inputProps={{ min: 0, step: 0.01 }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Updated Contract Amount" type="number" value={formData.updated_contract_amount} onChange={handleInputChange('updated_contract_amount')} variant="outlined" size="small" inputProps={{ min: 0, step: 0.01 }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Down Payment %" type="number" value={formData.down_payment_percent * 100} onChange={(e) => setFormData((prev) => ({ ...prev, down_payment_percent: Number(e.target.value) / 100 }))} variant="outlined" size="small" inputProps={{ min: 0, max: 100, step: 0.1 }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Retention %" type="number" value={formData.retention_percent * 100} onChange={(e) => setFormData((prev) => ({ ...prev, retention_percent: Number(e.target.value) / 100 }))} variant="outlined" size="small" inputProps={{ min: 0, max: 100, step: 0.1 }} />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: '#1a202c' }}>
            Additional Information
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="PO Number" value={formData.po_number} onChange={handleInputChange('po_number')} variant="outlined" size="small" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="PO Date (Project Start)" type="date" value={formData.po_date} onChange={handleInputChange('po_date')} variant="outlined" size="small" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Client Approver" value={formData.client_approver} onChange={handleInputChange('client_approver')} variant="outlined" size="small" />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', gap: 1 }}>
        <Button onClick={handleClose} variant="outlined" disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={16} /> : <SaveIcon />} sx={{ backgroundColor: '#2c5aa0', '&:hover': { backgroundColor: '#1e4a72' } }}>
          {loading ? 'Updating...' : 'Update Project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditProjectDialog;
