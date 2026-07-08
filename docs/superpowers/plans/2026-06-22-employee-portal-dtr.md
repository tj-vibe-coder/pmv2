# Employee Portal + DTR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an employee portal workspace at `/employee` with DTR entry and liquidation access, where `user`/`viewer` roles land after login instead of the full dashboard.

**Architecture:** New `/employee/*` routes wrapped in `ProtectedRoute` + `AppLayout`. Login redirect checks user role. Header hides workspace switcher for employee paths. Sidebar renders a slim `EmployeeNavList`. DTR entries stored in a new `dtr_entries` Firestore collection with CRUD endpoints in `server.js`.

**Tech Stack:** React 19, MUI v7, Express, Firebase Firestore, existing auth system (`getCurrentUser`, `requireActiveUser`).

## Global Constraints

- No new npm dependencies
- Follow existing `NET_PACIFIC_COLORS` design system and `AppLayout` pattern
- Reuse existing `LiquidationFormPage` component as-is (mount at employee route)
- DTR uses existing `DTREntry` interface from `src/types/Payroll.ts` (extended with `remarks` and `submittedAt`)
- Auth: existing `getCurrentUser(req)` + `isActiveUser(user)` pattern for all endpoints
- `server.js` DTR routes must be placed BEFORE the catch-all `/*splat` route (before line 2537)
- Type-check: `CI=true npm run build`

---

### Task 1: DTR API endpoints + type extension

Add DTR CRUD endpoints to `server.js` and extend the `DTREntry` type with `remarks` and `submittedAt`.

**Files:**
- Modify: `server.js` (add DTR routes before the catch-all at line 2537)
- Modify: `src/types/Payroll.ts` (extend DTREntry interface)

**Interfaces:**
- Consumes: `getCurrentUser(req)`, `isActiveUser(user)`, `db` (Firestore), existing patterns from other CRUD endpoints
- Produces: `GET /api/dtr`, `POST /api/dtr`, `PUT /api/dtr/:id`, `DELETE /api/dtr/:id` endpoints; extended `DTREntry` type with `remarks?: string` and `submittedAt?: string`

- [ ] **Step 1: Extend DTREntry type**

In `src/types/Payroll.ts`, add two fields to the `DTREntry` interface (after `tardinessMinutes` at line 40):

```ts
export interface DTREntry {
  id?: string;
  employeeId: string;
  entryDate: string; // YYYY-MM-DD
  dayType: DayType;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;
  isAbsent: boolean;
  tardinessMinutes: number;
  remarks?: string;
  submittedAt?: string;
}
```

- [ ] **Step 2: Add DTR routes to server.js**

Insert BEFORE the catch-all block (before line 2537 — `app.use(express.static(...))`). Use the same pattern as other CRUD routes in the file:

```js
// ─── DTR Entries ────────────────────────────────────────────────────────────
app.get('/api/dtr', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  const { employeeId } = req.query;
  if (!employeeId) return res.status(400).json({ error: 'employeeId query parameter required' });
  // Non-admin users can only query their own entries
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  if (!isAdmin && employeeId !== user.id) return res.status(403).json({ error: 'Forbidden' });
  try {
    const snap = await db.collection('dtr_entries').where('employeeId', '==', employeeId).get();
    const entries = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    res.json(entries);
  } catch (e) {
    console.error('GET /api/dtr error:', e);
    res.status(500).json({ error: 'Failed to fetch DTR entries' });
  }
});

app.post('/api/dtr', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  const { employeeId, entryDate, dayType, regularHours, overtimeHours, nightDiffHours, isAbsent, tardinessMinutes, remarks } = req.body;
  if (!employeeId || !entryDate || !dayType) return res.status(400).json({ error: 'employeeId, entryDate, and dayType are required' });
  // Non-admin users can only create entries for themselves
  const isAdmin = user.role === 'superadmin' || user.role === 'admin';
  if (!isAdmin && employeeId !== user.id) return res.status(403).json({ error: 'Forbidden' });
  // Duplicate check
  const existing = await db.collection('dtr_entries')
    .where('employeeId', '==', employeeId)
    .where('entryDate', '==', entryDate)
    .get();
  if (!existing.empty) return res.status(409).json({ error: `DTR entry already exists for ${entryDate}. Load and edit it instead.` });
  try {
    const entry = {
      employeeId,
      entryDate,
      dayType,
      regularHours: Number(regularHours) || 0,
      overtimeHours: Number(overtimeHours) || 0,
      nightDiffHours: Number(nightDiffHours) || 0,
      isAbsent: !!isAbsent,
      tardinessMinutes: Number(tardinessMinutes) || 0,
      remarks: remarks || '',
      submittedAt: new Date().toISOString(),
    };
    const ref = await db.collection('dtr_entries').add(entry);
    res.status(201).json({ ...entry, id: ref.id });
  } catch (e) {
    console.error('POST /api/dtr error:', e);
    res.status(500).json({ error: 'Failed to create DTR entry' });
  }
});

app.put('/api/dtr/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  try {
    const docRef = db.collection('dtr_entries').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'DTR entry not found' });
    const data = doc.data();
    const isAdmin = user.role === 'superadmin' || user.role === 'admin';
    if (!isAdmin && data.employeeId !== user.id) return res.status(403).json({ error: 'Forbidden' });
    const { employeeId, id: _id, ...updates } = req.body;
    updates.submittedAt = new Date().toISOString();
    await docRef.update(updates);
    const updated = await docRef.get();
    res.json({ ...updated.data(), id: updated.id });
  } catch (e) {
    console.error('PUT /api/dtr/:id error:', e);
    res.status(500).json({ error: 'Failed to update DTR entry' });
  }
});

app.delete('/api/dtr/:id', async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user || !isActiveUser(user)) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  try {
    const docRef = db.collection('dtr_entries').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'DTR entry not found' });
    const data = doc.data();
    const isAdmin = user.role === 'superadmin' || user.role === 'admin';
    if (!isAdmin && data.employeeId !== user.id) return res.status(403).json({ error: 'Forbidden' });
    await docRef.delete();
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/dtr/:id error:', e);
    res.status(500).json({ error: 'Failed to delete DTR entry' });
  }
});
```

- [ ] **Step 3: Verify the server starts**

Run: `npm start` (or restart if already running)
Expected: Server boots on port 3001 without errors.

- [ ] **Step 4: Commit**

```bash
git add server.js src/types/Payroll.ts
git commit -m "feat(dtr): add DTR CRUD API endpoints and extend DTREntry type"
```

---

### Task 2: Employee portal routing, sidebar, and landing page

Create the employee portal workspace: routes in App.tsx, nav list, landing page, and role-based redirect.

**Files:**
- Create: `src/components/employee/EmployeeNavList.tsx`
- Create: `src/components/employee/EmployeePortalHome.tsx`
- Modify: `src/App.tsx` (add `/employee/*` routes)
- Modify: `src/components/Sidebar.tsx` (render EmployeeNavList for `/employee` paths)
- Modify: `src/components/Header.tsx` (hide workspace switcher, show "Employee Portal" title)
- Modify: `src/components/LoginPage.tsx` (role-based redirect after login)

**Interfaces:**
- Consumes: `useAuth()` for user role, `AppLayout` wrapper, `ProtectedRoute` component, `LiquidationFormPage` component
- Produces: `/employee` route tree, `EmployeeNavList` component, `EmployeePortalHome` component, role-based login redirect

- [ ] **Step 1: Create EmployeeNavList.tsx**

Create `src/components/employee/EmployeeNavList.tsx`:

```tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  Home as HomeIcon,
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';

interface EmployeeNavListProps {
  isExpanded: boolean;
  navBtnSx: (selected: boolean) => object;
  iconSx: () => object;
}

const EmployeeNavList: React.FC<EmployeeNavListProps> = ({ isExpanded, navBtnSx, iconSx }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const items = [
    { label: 'Home', icon: <HomeIcon />, path: '/employee', exact: true },
    { label: 'Daily Time Record', icon: <CalendarIcon />, path: '/employee/dtr' },
    { label: 'Liquidation', icon: <ReceiptIcon />, path: '/employee/liquidation-form' },
  ];

  return (
    <List sx={{ px: 1 }}>
      {items.map((item) => {
        const selected = item.exact
          ? location.pathname === item.path
          : location.pathname.startsWith(item.path);
        return (
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isExpanded ? '' : item.label} placement="right" arrow>
              <ListItemButton
                selected={selected}
                onClick={() => navigate(item.path)}
                sx={navBtnSx(selected)}
              >
                <ListItemIcon sx={iconSx()}>{item.icon}</ListItemIcon>
                {isExpanded && (
                  <ListItemText primary={item.label} sx={{ color: 'white' }} />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        );
      })}
    </List>
  );
};

export default EmployeeNavList;
```

- [ ] **Step 2: Create EmployeePortalHome.tsx**

Create `src/components/employee/EmployeePortalHome.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Grid, Paper, Button } from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0', accent1: '#4f7bc8' };

const EmployeePortalHome: React.FC = () => {
  const navigate = useNavigate();

  const modules = [
    {
      title: 'Daily Time Record',
      description: 'Log your daily hours, overtime, and attendance.',
      icon: <CalendarIcon sx={{ color: NET_PACIFIC_COLORS.primary, fontSize: 28 }} />,
      path: '/employee/dtr',
    },
    {
      title: 'Expense Liquidation',
      description: 'Submit expense liquidation forms and receipts.',
      icon: <ReceiptIcon sx={{ color: NET_PACIFIC_COLORS.primary, fontSize: 28 }} />,
      path: '/employee/liquidation-form',
    },
  ];

  return (
    <Box sx={{ height: '100%' }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: NET_PACIFIC_COLORS.primary, mb: 3 }}>
        Employee Portal
      </Typography>
      <Grid container spacing={2}>
        {modules.map((m) => (
          <Grid key={m.path} size={{ xs: 12, sm: 6, md: 4 }}>
            <Paper
              sx={{
                borderRadius: 2,
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                border: '1px solid #e2e8f0',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {m.icon}
                <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
                  {m.title}
                </Typography>
              </Box>
              <Box sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography variant="body2" color="text.secondary">{m.description}</Typography>
                <Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => navigate(m.path)}
                    sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}
                  >
                    Open
                  </Button>
                </Box>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default EmployeePortalHome;
```

- [ ] **Step 3: Update Sidebar.tsx**

In `src/components/Sidebar.tsx`, add the employee workspace detection and nav list rendering.

Add import at the top:
```tsx
import EmployeeNavList from './employee/EmployeeNavList';
```

After the existing workspace detection lines (around line 57-58), add:
```tsx
const isEmployeeWorkspace = location.pathname === '/employee' || location.pathname.startsWith('/employee/');
```

In the nav list switching block (around line 164-170), add the employee case FIRST (before finance):
```tsx
{isEmployeeWorkspace ? (
  <EmployeeNavList isExpanded={isExpanded} navBtnSx={navBtnSx} iconSx={iconSx} />
) : isFinanceWorkspace ? (
  <FinanceNavList isExpanded={isExpanded} navBtnSx={navBtnSx} iconSx={iconSx} />
) : isSalesWorkspace ? (
  <SalesNavList isExpanded={isExpanded} navBtnSx={navBtnSx} iconSx={iconSx} />
) : (
  <List sx={{ px: 1 }}>
    {/* PM workspace nav items */}
  </List>
)}
```

Also update the sidebar title block (look for where it shows "Finance" or "Sales" as the sidebar title) to show "Employee" for the employee workspace.

- [ ] **Step 4: Update Header.tsx**

In `src/components/Header.tsx`, add employee workspace detection.

After the existing workspace detection (around line 30-32), add:
```tsx
const isEmployeeWorkspace = location.pathname === '/employee' || location.pathname.startsWith('/employee/');
```

Update the title (around line 82-84):
```tsx
<Typography variant="h5" component="div" sx={{ fontWeight: 600, color: '#2c5aa0', letterSpacing: '0.5px' }}>
  {isEmployeeWorkspace ? 'Employee Portal' : isFinanceWorkspace ? 'Finance' : isSalesWorkspace ? 'Sales' : 'Project Monitoring System'}
</Typography>
```

Hide the workspace ToggleButtonGroup when on employee workspace. Wrap the ToggleButtonGroup (around line 90-120) with:
```tsx
{!isEmployeeWorkspace && (
  <ToggleButtonGroup ... >
    ...
  </ToggleButtonGroup>
)}
```

- [ ] **Step 5: Update LoginPage.tsx for role-based redirect**

In `src/components/LoginPage.tsx`, change the hardcoded `/dashboard` redirects to be role-aware.

Import `useAuth` is already there. The `user` object is available via `useAuth()`. Add it to the destructuring if not already present.

Change line 66 (the useEffect redirect for already-authenticated users):
```tsx
useEffect(() => {
  if (isAuthenticated && user) {
    const target = (user.role === 'user' || user.role === 'viewer') ? '/employee' : '/dashboard';
    navigate(target, { replace: true });
  }
}, [isAuthenticated, user, navigate]);
```

Change line 90 (the post-login redirect):
```tsx
if (result.success) {
  // Re-read user from auth context after login
  const cachedUser = JSON.parse(localStorage.getItem('netpacific_user') || '{}');
  const target = (cachedUser.role === 'user' || cachedUser.role === 'viewer') ? '/employee' : '/dashboard';
  navigate(target, { replace: true });
}
```

- [ ] **Step 6: Add employee routes to App.tsx**

In `src/App.tsx`, add imports for the new components:
```tsx
import EmployeePortalHome from './components/employee/EmployeePortalHome';
```

Add employee routes BEFORE the catch-all redirects (before the old `/calcsheet/*` redirect block). The `LiquidationFormPage` import should already exist. Add routes:

```tsx
{/* Employee Portal */}
<Route path="/employee" element={<ProtectedRoute><AppLayout><EmployeePortalHome /></AppLayout></ProtectedRoute>} />
<Route path="/employee/dtr" element={<ProtectedRoute><AppLayout><DTRPage /></AppLayout></ProtectedRoute>} />
<Route path="/employee/liquidation-form" element={<ProtectedRoute><AppLayout><LiquidationFormPage /></AppLayout></ProtectedRoute>} />
```

Note: `DTRPage` doesn't exist yet — it's created in Task 3. For now, use a placeholder:
```tsx
const DTRPagePlaceholder = () => <Box sx={{ p: 3 }}><Typography>DTR Page — coming in Task 3</Typography></Box>;
```

Use `DTRPagePlaceholder` in the route temporarily. Task 3 will replace it.

Also add a role-based redirect guard. After the employee routes, add a guard that redirects `user`/`viewer` roles away from non-employee routes. The simplest approach: add a small `EmployeeGuard` component:

```tsx
const EmployeeGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  if (user && (user.role === 'user' || user.role === 'viewer')) {
    return <Navigate to="/employee" replace />;
  }
  return <>{children}</>;
};
```

Then wrap the main dashboard route and other admin routes with `EmployeeGuard`:
```tsx
<Route path="/dashboard" element={<ProtectedRoute><EmployeeGuard><AppLayout><ProjectMonitoringApp /></AppLayout></EmployeeGuard></ProtectedRoute>} />
```

Apply `EmployeeGuard` to `/dashboard`, `/finance/*`, `/sales/*`, and `/reports/*` route groups. Do NOT apply it to `/login` or `/employee/*`.

- [ ] **Step 7: Verify the app builds and the portal renders**

Run: `CI=true npm run build`
Expected: Build succeeds.

Manually verify:
1. Navigate to `/employee` — landing page shows with DTR and Liquidation cards
2. Sidebar shows only Home, DTR, Liquidation
3. Header shows "Employee Portal" with no workspace switcher
4. Clicking Liquidation card navigates to `/employee/liquidation-form` and shows the existing form
5. DTR card shows the placeholder

- [ ] **Step 8: Commit**

```bash
git add src/components/employee/ src/App.tsx src/components/Sidebar.tsx src/components/Header.tsx src/components/LoginPage.tsx
git commit -m "feat(employee): add employee portal with routing, sidebar, and landing page"
```

---

### Task 3: DTR entry page

Build the DTR page with accordion layout (New Entry + History), sticky bottom bar, and API integration.

**Files:**
- Create: `src/components/employee/DTRPage.tsx`
- Modify: `src/App.tsx` (replace DTRPagePlaceholder with real DTRPage import)

**Interfaces:**
- Consumes: `DTREntry` and `DayType` types from `src/types/Payroll.ts`; `GET/POST/PUT/DELETE /api/dtr` endpoints from Task 1; `useAuth()` for `user.id`
- Produces: `DTRPage` component with full DTR CRUD UI

- [ ] **Step 1: Create DTRPage.tsx**

Create `src/components/employee/DTRPage.tsx`:

```tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Alert,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import type { DTREntry, DayType } from '../../types/Payroll';

const NET_PACIFIC_COLORS = { primary: '#2c5aa0' };

const DAY_TYPES: { value: DayType; label: string }[] = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'REST_DAY', label: 'Rest Day' },
  { value: 'SPECIAL_HOLIDAY', label: 'Special Holiday' },
  { value: 'REGULAR_HOLIDAY', label: 'Regular Holiday' },
  { value: 'DOUBLE_HOLIDAY', label: 'Double Holiday' },
];

const API_BASE = '';

const DTRPage: React.FC = () => {
  const { user } = useAuth();
  const employeeId = user?.id || '';

  // Form state
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dayType, setDayType] = useState<DayType>('REGULAR');
  const [regularHours, setRegularHours] = useState(8);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [nightDiffHours, setNightDiffHours] = useState(0);
  const [tardinessMinutes, setTardinessMinutes] = useState(0);
  const [isAbsent, setIsAbsent] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Data state
  const [entries, setEntries] = useState<DTREntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(() => new Date().getMonth());
  const [filterYear, setFilterYear] = useState(() => new Date().getFullYear());

  // Accordion state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    entry: true,
    history: true,
  });
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const fetchEntries = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('netpacific_token');
      const res = await fetch(`${API_BASE}/api/dtr?employeeId=${encodeURIComponent(employeeId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEntries(data);
    } catch {
      setFeedback({ severity: 'error', message: 'Failed to load DTR entries.' });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const filteredEntries = useMemo(() => {
    return entries
      .filter(e => {
        const d = new Date(e.entryDate);
        return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
      })
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  }, [entries, filterMonth, filterYear]);

  const resetForm = () => {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setDayType('REGULAR');
    setRegularHours(8);
    setOvertimeHours(0);
    setNightDiffHours(0);
    setTardinessMinutes(0);
    setIsAbsent(false);
    setRemarks('');
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!employeeId) return;
    const token = localStorage.getItem('netpacific_token');
    const body = {
      employeeId,
      entryDate,
      dayType,
      regularHours: isAbsent ? 0 : regularHours,
      overtimeHours: isAbsent ? 0 : overtimeHours,
      nightDiffHours: isAbsent ? 0 : nightDiffHours,
      isAbsent,
      tardinessMinutes: isAbsent ? 0 : tardinessMinutes,
      remarks,
    };
    try {
      const url = editingId ? `${API_BASE}/api/dtr/${editingId}` : `${API_BASE}/api/dtr`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }
      setSaveFeedback(true);
      setTimeout(() => setSaveFeedback(false), 2000);
      resetForm();
      await fetchEntries();
    } catch (e) {
      setFeedback({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to save.' });
    }
  };

  const handleLoad = (entry: DTREntry) => {
    setEntryDate(entry.entryDate);
    setDayType(entry.dayType);
    setRegularHours(entry.regularHours);
    setOvertimeHours(entry.overtimeHours);
    setNightDiffHours(entry.nightDiffHours);
    setTardinessMinutes(entry.tardinessMinutes);
    setIsAbsent(entry.isAbsent);
    setRemarks(entry.remarks || '');
    setEditingId(entry.id || null);
    setExpandedSections(prev => ({ ...prev, entry: true }));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this DTR entry? This cannot be undone.')) return;
    const token = localStorage.getItem('netpacific_token');
    try {
      const res = await fetch(`${API_BASE}/api/dtr/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      if (editingId === id) resetForm();
      await fetchEntries();
    } catch {
      setFeedback({ severity: 'error', message: 'Failed to delete entry.' });
    }
  };

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flex: 1, overflow: 'auto', pb: 10 }}>
        {feedback && (
          <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ mb: 1 }}>
            {feedback.message}
          </Alert>
        )}

        {/* Accordion 1: New Entry */}
        <Accordion
          expanded={expandedSections.entry}
          onChange={() => toggleSection('entry')}
          disableGutters
          elevation={0}
          sx={{ border: '1px solid #e2e8f0', '&:before': { display: 'none' }, mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1 }}>
              {editingId ? 'Edit Entry' : 'New Entry'}
            </Typography>
            {entryDate && <Chip label="Ready" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />}
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField size="small" fullWidth label="Date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Day Type</InputLabel>
                  <Select value={dayType} label="Day Type" onChange={(e) => setDayType(e.target.value as DayType)}>
                    {DAY_TYPES.map(dt => <MenuItem key={dt.value} value={dt.value}>{dt.label}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControlLabel
                  control={<Checkbox checked={isAbsent} onChange={(e) => { setIsAbsent(e.target.checked); if (e.target.checked) { setRegularHours(0); setOvertimeHours(0); setNightDiffHours(0); setTardinessMinutes(0); } else { setRegularHours(8); } }} />}
                  label="Absent"
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField size="small" fullWidth label="Regular Hours" type="number" value={regularHours} onChange={(e) => setRegularHours(Number(e.target.value))} disabled={isAbsent} inputProps={{ min: 0, max: 24, step: 0.5 }} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField size="small" fullWidth label="Overtime Hours" type="number" value={overtimeHours} onChange={(e) => setOvertimeHours(Number(e.target.value))} disabled={isAbsent} inputProps={{ min: 0, max: 16, step: 0.5 }} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField size="small" fullWidth label="Night Diff Hours" type="number" value={nightDiffHours} onChange={(e) => setNightDiffHours(Number(e.target.value))} disabled={isAbsent} inputProps={{ min: 0, max: 16, step: 0.5 }} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField size="small" fullWidth label="Tardiness (min)" type="number" value={tardinessMinutes} onChange={(e) => setTardinessMinutes(Number(e.target.value))} disabled={isAbsent} inputProps={{ min: 0, step: 1 }} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField size="small" fullWidth label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. site work at LBI plant" />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {/* Accordion 2: History */}
        <Accordion
          expanded={expandedSections.history}
          onChange={() => toggleSection('history')}
          disableGutters
          elevation={0}
          sx={{ border: '1px solid #e2e8f0', '&:before': { display: 'none' }, mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary, flex: 1 }}>
              My DTR History
            </Typography>
            <Chip label={`${filteredEntries.length} entries`} size="small" variant="outlined" sx={{ mr: 1 }} />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <Box sx={{ display: 'flex', gap: 1.5, px: 2, py: 1, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Month</InputLabel>
                <Select value={filterMonth} label="Month" onChange={(e) => setFilterMonth(Number(e.target.value))}>
                  {months.map((m, i) => <MenuItem key={i} value={i}>{m}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Year</InputLabel>
                <Select value={filterYear} label="Year" onChange={(e) => setFilterYear(Number(e.target.value))}>
                  {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            <TableContainer>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Day Type</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Reg Hrs</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>OT Hrs</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Night Diff</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Tardy</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Remarks</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8125rem', bgcolor: '#f8fafc' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No entries for {months[filterMonth]} {filterYear}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((e) => (
                      <TableRow key={e.id} hover selected={editingId === e.id}>
                        <TableCell>{new Date(e.entryDate + 'T00:00:00').toLocaleDateString('en-US', { dateStyle: 'medium' })}</TableCell>
                        <TableCell>
                          {e.isAbsent ? (
                            <Chip label="Absent" size="small" color="error" variant="outlined" />
                          ) : (
                            DAY_TYPES.find(dt => dt.value === e.dayType)?.label || e.dayType
                          )}
                        </TableCell>
                        <TableCell align="right">{e.regularHours}</TableCell>
                        <TableCell align="right">{e.overtimeHours || '—'}</TableCell>
                        <TableCell align="right">{e.nightDiffHours || '—'}</TableCell>
                        <TableCell align="right">{e.tardinessMinutes ? `${e.tardinessMinutes}m` : '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.remarks || '—'}</TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => handleLoad(e)} sx={{ color: NET_PACIFIC_COLORS.primary, textTransform: 'none' }}>Edit</Button>
                          <IconButton size="small" color="error" onClick={() => handleDelete(e.id!)} title="Delete">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* Sticky bottom bar */}
      <Paper
        elevation={3}
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          borderTop: `2px solid ${NET_PACIFIC_COLORS.primary}`,
          px: 2,
          py: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              {months[filterMonth]} {filterYear} — {filteredEntries.length} entries
            </Typography>
            {editingId && (
              <Chip label={`Editing ${entryDate}`} size="small" color="info" variant="outlined" />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {editingId && (
              <Button variant="outlined" size="small" onClick={resetForm} sx={{ borderColor: NET_PACIFIC_COLORS.primary, color: NET_PACIFIC_COLORS.primary }}>
                Cancel
              </Button>
            )}
            <Button
              variant="contained"
              size="small"
              onClick={handleSave}
              disabled={!entryDate}
              sx={{ bgcolor: NET_PACIFIC_COLORS.primary }}
            >
              {saveFeedback ? 'Saved' : editingId ? 'Update' : 'Save'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default DTRPage;
```

- [ ] **Step 2: Replace placeholder in App.tsx**

In `src/App.tsx`, replace the `DTRPagePlaceholder` and its route with the real import:

```tsx
import DTRPage from './components/employee/DTRPage';
```

Update the route:
```tsx
<Route path="/employee/dtr" element={<ProtectedRoute><AppLayout><DTRPage /></AppLayout></ProtectedRoute>} />
```

Remove the `DTRPagePlaceholder` const.

- [ ] **Step 3: Verify the app builds and DTR page works**

Run: `CI=true npm run build`
Expected: Build succeeds.

Manually verify:
1. Navigate to `/employee/dtr`
2. Fill in a date, day type, hours → click Save → entry appears in history table
3. Click Edit on an entry → form populates → change hours → click Update → entry updates
4. Click Delete → confirmation → entry removed
5. Change month/year filters → table updates
6. Check that duplicate date entries are rejected (409 from API)

- [ ] **Step 4: Commit**

```bash
git add src/components/employee/DTRPage.tsx src/App.tsx
git commit -m "feat(employee): add DTR entry page with history and CRUD"
```
