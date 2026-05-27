import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Slider,
  Stack,
  Alert,
  Box,
  Chip,
} from '@mui/material';
import type { Project } from '../types/Project';
import dataService from '../services/dataService';
import {
  loadWBS,
  saveWBS,
  saveProgressSnapshot,
  WBSItem,
} from './ProjectDetails';

interface UpdateProgressDialogProps {
  open: boolean;
  project: Project;
  onClose: () => void;
  onSaved: (project: Project) => void;
}

const MARKS = [
  { value: 0, label: '0%' },
  { value: 25, label: '25%' },
  { value: 50, label: '50%' },
  { value: 75, label: '75%' },
  { value: 100, label: '100%' },
];

const UpdateProgressDialog: React.FC<UpdateProgressDialogProps> = ({
  open,
  project,
  onClose,
  onSaved,
}) => {
  const [progress, setProgress] = useState(project.actual_site_progress_percent ?? 0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const schedule = project.billing_schedule || [];
  const prevProgress = project.actual_site_progress_percent ?? 0;

  // Auto-detect the PB# for the new progress value: highest eligible milestone
  const detectPbNumber = (newProgress: number): string => {
    const eligible = schedule.filter(m => m.trigger_pct <= newProgress);
    if (eligible.length === 0) return '';
    return eligible[eligible.length - 1].pb_number;
  };

  // Milestones that would become newly eligible at the selected progress
  const newlyEligible = schedule.filter(
    m => m.trigger_pct <= progress && m.trigger_pct > prevProgress,
  );

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const result = await dataService.updateProject(project.id, {
        actual_site_progress_percent: progress,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to update project');
      }

      const pbNumber = detectPbNumber(progress);

      // Distribute progress to WBS items proportionally
      const wbsItems = loadWBS(project.id);
      if (wbsItems.length > 0) {
        const totalWeight = wbsItems.reduce((s, i) => s + i.weight, 0);
        const updatedWBS: WBSItem[] = wbsItems.map((item) => ({
          ...item,
          progress: totalWeight > 0
            ? Math.round(progress * (item.weight / totalWeight))
            : item.progress,
        }));
        saveWBS(project.id, updatedWBS);
        saveProgressSnapshot(project.id, {
          date: new Date().toISOString(),
          pbNumber,
          wbsItems: updatedWBS,
          overallProgress: progress,
        });
      } else {
        saveProgressSnapshot(project.id, {
          date: new Date().toISOString(),
          pbNumber,
          wbsItems: [],
          overallProgress: progress,
        });
      }

      const updatedProject: Project = {
        ...project,
        actual_site_progress_percent: progress,
      };

      onSaved(updatedProject);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Update Progress — {project.project_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Current: {prevProgress}%
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Slider
                value={progress}
                onChange={(_, v) => setProgress(v as number)}
                min={0}
                max={100}
                step={1}
                marks={MARKS}
                valueLabelDisplay="auto"
                sx={{ flexGrow: 1 }}
              />
              <TextField
                type="number"
                value={progress}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!isNaN(v)) setProgress(Math.max(0, Math.min(100, v)));
                }}
                size="small"
                sx={{ width: 80 }}
                inputProps={{ min: 0, max: 100 }}
                InputProps={{ endAdornment: <Typography variant="body2" color="text.secondary">%</Typography> }}
              />
            </Box>
          </Box>

          {/* Show newly eligible milestones so user knows to create invoices */}
          {newlyEligible.length > 0 && (
            <Alert severity="info" icon={false}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Billing milestone{newlyEligible.length > 1 ? 's' : ''} now eligible:
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                {newlyEligible.map(m => (
                  <Chip key={m.id} label={`${m.pb_number}: ${m.label}`} size="small" color="warning" />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Create invoices from the Progress Billing section after saving.
              </Typography>
            </Alert>
          )}

          <TextField
            label="Notes (optional)"
            size="small"
            fullWidth
            multiline
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Site preparation complete, moving to installation phase"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          sx={{ backgroundColor: '#2c5aa0', '&:hover': { backgroundColor: '#1e4a72' } }}
        >
          {saving ? 'Saving…' : 'Update Progress'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UpdateProgressDialog;
