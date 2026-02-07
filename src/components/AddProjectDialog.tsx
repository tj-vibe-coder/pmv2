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
  Paper
} from '@mui/material';
import { Add as AddIcon, Save as SaveIcon } from '@mui/icons-material';
import dataService from '../services/dataService';
import { Project } from '../types/Project';
import { Client } from '../types/Client';

const API_BASE = '/api';

interface AddProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onProjectAdded: () => void;
}

const AddProjectDialog: React.FC<AddProjectDialogProps> = ({ open, onClose, onProjectAdded }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  useEffect(() => {
    if (open) {
      setClientsLoading(true);
      fetch(`${API_BASE}/clients`)
        .then((res) => res.ok ? res.json() : [])
        .then((data) => setClients(Array.isArray(data) ? data : []))
        .catch(() => setClients([]))
        .finally(() => setClientsLoading(false));
    }
  }, [open]);

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
    po_date: '', // YYYY-MM-DD for input; PO Date = start of project
    client_status: '',
    down_payment_percent: 0.1,
    retention_percent: 0.1,
    duration_days: 90,
    payment_schedule: '10%, 80%, 10%',
    payment_terms: '30',
    bonds_requirement: 'NO',
    client_approver: '',
    progress_billing_schedule: 'Monthly'
  });

  const categoryOptions = ['Services', 'Electrical', 'PLC/SCADA', 'BMS'];

  const statusPercentToProjectStatus = (p: number): string => {
    if (p <= 0) return 'Not Started';
    if (p >= 100) return 'Completed';
    return 'In Progress';
  };

  const handleInputChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: field.includes('amount') || field.includes('percent') || field === 'duration_days' || field === 'year'
        ? Number(value) || 0
        : value
    }));
    setError(null);
  };

  const handleSubmit = async () => {
    // Validate required fields
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
        : Math.floor(Date.now() / 1000);
      const { status_percent, po_date: _poDateStr, ...formRest } = formData;
      const projectData: Partial<Project> = {
        ...formRest,
        project_director: undefined,
        ovp_number: '',
        am: '',
        project_no: formData.project_no || undefined,
        po_date: formData.po_date ? poDateUnix : null,
        start_date: poDateUnix,
        completion_date: formData.po_date
          ? Math.floor(new Date(formData.po_date).getTime() / 1000 + formData.duration_days * 24 * 60 * 60)
          : Math.floor((Date.now() + (formData.duration_days * 24 * 60 * 60 * 1000)) / 1000),
        actual_site_progress_percent: status_percent,
        actual_progress: 0,
        project_status: statusPercentToProjectStatus(status_percent),
        evaluated_progress_percent: 0,
        evaluated_progress: 0,
        for_rfb_percent: 0,
        for_rfb_amount: 0,
        work_in_progress_ap: formData.updated_contract_amount || formData.contract_amount,
        work_in_progress_ep: formData.updated_contract_amount || formData.contract_amount,
        updated_contract_balance_percent: 1,
        total_contract_balance: formData.updated_contract_amount || formData.contract_amount,
        updated_contract_balance_net_percent: 1,
        updated_contract_balance_net: formData.updated_contract_amount || formData.contract_amount,
        contract_billed_gross_percent: 0,
        contract_billed: 0,
        contract_billed_net_percent: 0,
        amount_contract_billed_net: 0,
        for_retention_billing_percent: 0,
        amount_for_retention_billing: 0,
        retention_status: '',
        unevaluated_progress: 0,
        remarks: ''
      };

      const result = await dataService.addProject(projectData);
      
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onProjectAdded();
          handleClose();
        }, 1000);
      } else {
        setError(result.errors?.[0] || 'Failed to create project');
      }
    } catch (err) {
      setError('An error occurred while creating the project');
      console.error('Error creating project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setSelectedClient(null);
      setFormData({
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
        progress_billing_schedule: 'Monthly'
      });
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{ 
        pb: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        backgroundColor: '#f8fafc',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <AddIcon color="primary" />
        <Typography variant="h6" component="span">
          Add New Project
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
            Project created successfully!
          </Alert>
        )}

        <Box component="form" noValidate>
          {/* Basic Information */}
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: '#1a202c' }}>
            Basic Information
          </Typography>
          
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Project No."
                value={formData.project_no}
                onChange={handleInputChange('project_no')}
                variant="outlined"
                size="small"
                placeholder="e.g. P-2024-001"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Project Name *"
                value={formData.project_name}
                onChange={handleInputChange('project_name')}
                variant="outlined"
                size="small"
              />
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
                helperText={clientsLoading ? 'Loading clients...' : 'Select a client to fill details'}
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
                        <Typography variant="body2">
                          <strong>Contact:</strong> {[selectedClient.contact_person, selectedClient.designation].filter(Boolean).join(' – ')}
                        </Typography>
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
              <TextField
                fullWidth
                label="Year"
                type="number"
                value={formData.year}
                onChange={handleInputChange('year')}
                variant="outlined"
                size="small"
                inputProps={{ min: 2000, max: 2030 }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Project Details */}
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: '#1a202c' }}>
            Project Details
          </Typography>
          
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Project Category"
                value={formData.project_category}
                onChange={handleInputChange('project_category')}
                variant="outlined"
                size="small"
              >
                {categoryOptions.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Location / Address"
                value={formData.project_location}
                onChange={handleInputChange('project_location')}
                variant="outlined"
                size="small"
                placeholder="Region or full address"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Scope of Work"
                value={formData.scope_of_work}
                onChange={handleInputChange('scope_of_work')}
                variant="outlined"
                size="small"
                multiline
                rows={2}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Status (%)"
                type="number"
                value={formData.status_percent}
                onChange={handleInputChange('status_percent')}
                variant="outlined"
                size="small"
                inputProps={{ min: 0, max: 100, step: 1 }}
                helperText="0–100%"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Duration (Days)"
                type="number"
                value={formData.duration_days}
                onChange={handleInputChange('duration_days')}
                variant="outlined"
                size="small"
                inputProps={{ min: 1 }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Financial Information */}
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: '#1a202c' }}>
            Financial Information
          </Typography>
          
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Contract Amount"
                type="number"
                value={formData.contract_amount}
                onChange={handleInputChange('contract_amount')}
                variant="outlined"
                size="small"
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Updated Contract Amount"
                type="number"
                value={formData.updated_contract_amount}
                onChange={handleInputChange('updated_contract_amount')}
                variant="outlined"
                size="small"
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Down Payment %"
                type="number"
                value={formData.down_payment_percent * 100}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  down_payment_percent: Number(e.target.value) / 100
                }))}
                variant="outlined"
                size="small"
                inputProps={{ min: 0, max: 100, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Retention %"
                type="number"
                value={formData.retention_percent * 100}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  retention_percent: Number(e.target.value) / 100
                }))}
                variant="outlined"
                size="small"
                inputProps={{ min: 0, max: 100, step: 0.1 }}
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Additional Information */}
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: '#1a202c' }}>
            Additional Information
          </Typography>
          
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="PO Number"
                value={formData.po_number}
                onChange={handleInputChange('po_number')}
                variant="outlined"
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="PO Date (Project Start)"
                type="date"
                value={formData.po_date}
                onChange={handleInputChange('po_date')}
                variant="outlined"
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Client Approver"
                value={formData.client_approver}
                onChange={handleInputChange('client_approver')}
                variant="outlined"
                size="small"
              />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 3, 
        backgroundColor: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        gap: 1
      }}>
        <Button 
          onClick={handleClose}
          variant="outlined"
          disabled={loading}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : <SaveIcon />}
          sx={{
            backgroundColor: '#2c5aa0',
            '&:hover': {
              backgroundColor: '#1e4a72'
            }
          }}
        >
          {loading ? 'Creating...' : 'Create Project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddProjectDialog;