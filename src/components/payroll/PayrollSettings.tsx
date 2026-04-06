import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Alert, CircularProgress,
  Divider, InputAdornment,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RestoreIcon from '@mui/icons-material/Restore';
import {
  getContributionRates, saveContributionRates, ContributionRates, DEFAULT_RATES,
} from '../../utils/firebasePayroll';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const PayrollSettings: React.FC = () => {
  const [rates, setRates] = useState<ContributionRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getContributionRates()
      .then(setRates)
      .finally(() => setLoading(false));
  }, []);

  const setRate = (field: keyof ContributionRates) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRates((r) => ({ ...r, [field]: parseFloat(e.target.value) || 0 }));
      setSuccess(false);
    };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await saveContributionRates(rates);
      setSuccess(true);
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRates(DEFAULT_RATES);
    setSuccess(false);
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="h6" fontWeight={600} mb={1}>Contribution Rate Settings</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        These rates are applied when computing payslips. Update them whenever the government issues a new circular.
        Current values shown — edit and save to override.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>Settings saved successfully.</Alert>}

      {/* PhilHealth */}
      <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} color="#2853c0" mb={2}>
          PhilHealth (Circular 2023-0014)
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Premium Rate"
            type="number"
            value={(rates.philhealthRate * 100).toFixed(2)}
            onChange={(e) => {
              setRates((r) => ({ ...r, philhealthRate: parseFloat(e.target.value) / 100 || 0 }));
              setSuccess(false);
            }}
            InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
            inputProps={{ step: 0.01, min: 0, max: 100 }}
            helperText="Split equally employee / employer"
            sx={{ width: 180 }}
          />
          <TextField
            label="Minimum (₱/month)"
            type="number"
            value={rates.philhealthMin}
            onChange={setRate('philhealthMin')}
            inputProps={{ min: 0 }}
            sx={{ width: 180 }}
          />
          <TextField
            label="Maximum (₱/month)"
            type="number"
            value={rates.philhealthMax}
            onChange={setRate('philhealthMax')}
            inputProps={{ min: 0 }}
            sx={{ width: 180 }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" mt={1} display="block">
          Current: {pct(rates.philhealthRate)} rate · Min ₱{rates.philhealthMin.toLocaleString()} · Max ₱{rates.philhealthMax.toLocaleString()}
        </Typography>
      </Paper>

      {/* Pag-IBIG */}
      <Paper sx={{ p: 3, borderRadius: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} color="#2853c0" mb={2}>
          Pag-IBIG / HDMF
        </Typography>
        <TextField
          label="Monthly Contribution Cap (₱)"
          type="number"
          value={rates.pagibigCap}
          onChange={setRate('pagibigCap')}
          inputProps={{ min: 0 }}
          helperText="Max employee and employer contribution per month"
          sx={{ width: 240 }}
        />
        <Typography variant="caption" color="text.secondary" mt={1} display="block">
          Current cap: ₱{rates.pagibigCap} · Employee: 1% (≤₱1,500 salary) or 2% · Employer: 2% (rates fixed by law)
        </Typography>
      </Paper>

      {/* SSS */}
      <Paper sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} color="#2853c0" mb={2}>
          SSS (Circular 2023-002)
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Employee Rate"
            type="number"
            value={(rates.sssEmployeeRate * 100).toFixed(2)}
            onChange={(e) => {
              setRates((r) => ({ ...r, sssEmployeeRate: parseFloat(e.target.value) / 100 || 0 }));
              setSuccess(false);
            }}
            InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
            inputProps={{ step: 0.01, min: 0, max: 100 }}
            helperText="Applied to Monthly Salary Credit (MSC)"
            sx={{ width: 200 }}
          />
          <TextField
            label="Employer Rate"
            type="number"
            value={(rates.sssEmployerRate * 100).toFixed(2)}
            onChange={(e) => {
              setRates((r) => ({ ...r, sssEmployerRate: parseFloat(e.target.value) / 100 || 0 }));
              setSuccess(false);
            }}
            InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
            inputProps={{ step: 0.01, min: 0, max: 100 }}
            helperText="Applied to MSC (+ EC fixed at ₱10 or ₱30)"
            sx={{ width: 200 }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" mt={1} display="block">
          Current: Employee {pct(rates.sssEmployeeRate)} · Employer {pct(rates.sssEmployerRate)} · MSC table (₱4,000–₱30,000) is statutory and fixed in code
        </Typography>
      </Paper>

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" startIcon={<RestoreIcon />} onClick={handleReset}>
          Reset to Defaults
        </Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}
          sx={{ bgcolor: '#2853c0' }}>
          {saving ? <CircularProgress size={20} /> : 'Save Settings'}
        </Button>
      </Box>

      {rates.updatedAt && (
        <Typography variant="caption" color="text.secondary" mt={1} display="block">
          Last updated: {new Date(rates.updatedAt).toLocaleString('en-PH')} by {rates.updatedBy}
        </Typography>
      )}
    </Box>
  );
};

export default PayrollSettings;
