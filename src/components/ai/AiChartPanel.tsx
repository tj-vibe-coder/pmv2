import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip as MuiTooltip,
  Typography,
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PieChartIcon from '@mui/icons-material/PieChart';
import TableChartIcon from '@mui/icons-material/TableChart';
import DownloadIcon from '@mui/icons-material/Download';
import SortIcon from '@mui/icons-material/Sort';
import LaunchIcon from '@mui/icons-material/Launch';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import dataService from '../../services/dataService';
import type { AiChart, AiChartType } from '../../types/AiAssist';

// Matches the NET_PACIFIC_COLORS constant redeclared per-page across this app
// (see docs/DESIGN_PHILOSOPHY.md §2 / src/components/Dashboard.tsx).
const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
  accent: '#00a8cc',
  teal: '#059669',
  amber: '#d97706',
  purple: '#7c3aed',
  slate: '#64748b',
};

const CATEGORICAL_PALETTE = [
  '#2c5aa0',
  '#00a8cc',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#e11d48',
  '#475569',
  '#0284c7',
  '#16a34a',
  '#ca8a04',
];

const SEQUENTIAL_LIGHT = '#c9dbf0';

const CHART_FIELD_BY_TOOL: Record<string, { valueKey: string; valueLabel: string }> = {
  get_portfolio_summary: { valueKey: 'totalBalance', valueLabel: 'Remaining balance' },
  get_expense_summary: { valueKey: 'totalAmount', valueLabel: 'Total expense' },
  query_analytics: { valueKey: 'totalAmount', valueLabel: 'Total amount' },
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(from: string, to: string, t: number): string {
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${mix(fr, tr)}${mix(fg, tg)}${mix(fb, tb)}`;
}

interface AiChartPanelProps {
  chart: AiChart | null;
  onOpenStudio?: (chart: AiChart) => void;
}

type SortMode = 'default' | 'value_desc' | 'value_asc' | 'alpha';

function AiChartPanel({ chart, onOpenStudio }: AiChartPanelProps): React.ReactElement | null {
  const [activeView, setActiveView] = useState<AiChartType | 'table'>(chart?.type || 'bar');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [copied, setCopied] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);

  React.useEffect(() => {
    if (chart?.type) {
      setActiveView(chart.type);
    }
  }, [chart?.type]);

  const field = useMemo(() => {
    if (!chart || !chart.tool) return undefined;
    return CHART_FIELD_BY_TOOL[chart.tool];
  }, [chart]);

  const rawRows = useMemo(() => {
    if (!chart || !field || !Array.isArray(chart.data)) return [];
    return chart.data.map((row) => ({
      group: typeof row.group === 'string' ? row.group : String(row.group ?? row.label ?? '—'),
      value: Number(row[field.valueKey]) || 0,
      count: typeof row.count === 'number' ? row.count : undefined,
      raw: row,
    }));
  }, [chart, field]);

  const rows = useMemo(() => {
    const list = [...rawRows];
    if (sortMode === 'value_desc') {
      list.sort((a, b) => b.value - a.value);
    } else if (sortMode === 'value_asc') {
      list.sort((a, b) => a.value - b.value);
    } else if (sortMode === 'alpha') {
      list.sort((a, b) => a.group.localeCompare(b.group));
    }
    return list;
  }, [rawRows, sortMode]);

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const total = rows.reduce((s, r) => s + r.value, 0);
    const maxRow = [...rows].sort((a, b) => b.value - a.value)[0];
    return {
      total,
      count: rows.length,
      maxLabel: maxRow?.group,
      maxValue: maxRow?.value || 0,
    };
  }, [rows]);

  const colorByGroup = useMemo(() => {
    const rankedAsc = [...rows].sort((a, b) => a.value - b.value).map((r) => r.group);
    const map = new Map<string, string>();
    rankedAsc.forEach((group, index) => {
      const t = rankedAsc.length > 1 ? index / (rankedAsc.length - 1) : 1;
      map.set(group, mixHex(SEQUENTIAL_LIGHT, NET_PACIFIC_COLORS.secondary, t));
    });
    return map;
  }, [rows]);

  if (!chart || !field || rows.length === 0) return null;

  const handleExportCsv = () => {
    setExportMenuAnchor(null);
    const headers = ['Group', field.valueLabel];
    const csvRows = [headers.join(',')];
    rows.forEach((r) => {
      csvRows.push(`"${r.group.replace(/"/g, '""')}",${r.value}`);
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${chart.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyTsv = () => {
    setExportMenuAnchor(null);
    const headers = ['Group', field.valueLabel];
    const lines = [headers.join('\t')];
    rows.forEach((r) => {
      lines.push(`${r.group}\t${r.value}`);
    });
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const isTable = activeView === 'table';

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e2e8f0',
        transition: 'all 0.2s ease',
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h6"
            sx={{
              fontSize: '1.05rem',
              fontWeight: 600,
              color: NET_PACIFIC_COLORS.primary,
              letterSpacing: '-0.01em',
            }}
          >
            {chart.title}
          </Typography>
          {summary && (
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Chip
                label={`Total: ${dataService.formatCurrency(summary.total)}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.75rem', height: 22, borderColor: '#cbd5e1' }}
              />
              <Chip
                label={`${summary.count} items`}
                size="small"
                sx={{ fontSize: '0.75rem', height: 22, bgcolor: '#f1f5f9' }}
              />
            </Stack>
          )}
        </Box>

        <Stack direction="row" spacing={0.75} alignItems="center">
          <ButtonGroup size="small" variant="outlined" aria-label="Visual view options">
            <MuiTooltip title="Vertical Bar Chart">
              <Button
                variant={activeView === 'bar' ? 'contained' : 'outlined'}
                onClick={() => setActiveView('bar')}
                sx={{ minWidth: 34, p: 0.75 }}
                aria-label="Bar chart view"
              >
                <BarChartIcon fontSize="small" />
              </Button>
            </MuiTooltip>
            <MuiTooltip title="Line Trend">
              <Button
                variant={activeView === 'line' ? 'contained' : 'outlined'}
                onClick={() => setActiveView('line')}
                sx={{ minWidth: 34, p: 0.75 }}
                aria-label="Line trend view"
              >
                <ShowChartIcon fontSize="small" />
              </Button>
            </MuiTooltip>
            <MuiTooltip title="Donut / Distribution">
              <Button
                variant={activeView === 'donut' || activeView === 'pie' ? 'contained' : 'outlined'}
                onClick={() => setActiveView('donut')}
                sx={{ minWidth: 34, p: 0.75 }}
                aria-label="Donut distribution view"
              >
                <PieChartIcon fontSize="small" />
              </Button>
            </MuiTooltip>
            <MuiTooltip title="Data Table">
              <Button
                variant={isTable ? 'contained' : 'outlined'}
                onClick={() => setActiveView('table')}
                sx={{ minWidth: 34, p: 0.75 }}
                aria-label="Table view"
              >
                <TableChartIcon fontSize="small" />
              </Button>
            </MuiTooltip>
          </ButtonGroup>

          <MuiTooltip title={`Sort: ${sortMode === 'value_desc' ? 'Highest first' : sortMode === 'value_asc' ? 'Lowest first' : sortMode === 'alpha' ? 'A-Z' : 'Default'}`}>
            <IconButton
              size="small"
              onClick={() => {
                const modes: SortMode[] = ['default', 'value_desc', 'value_asc', 'alpha'];
                const next = modes[(modes.indexOf(sortMode) + 1) % modes.length];
                setSortMode(next);
              }}
              sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}
              aria-label="Toggle sort mode"
            >
              <SortIcon fontSize="small" />
            </IconButton>
          </MuiTooltip>

          <MuiTooltip title="Export Data">
            <IconButton
              size="small"
              onClick={(e) => setExportMenuAnchor(e.currentTarget)}
              sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}
              aria-label="Export menu"
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
          </MuiTooltip>
          <Menu
            anchorEl={exportMenuAnchor}
            open={Boolean(exportMenuAnchor)}
            onClose={() => setExportMenuAnchor(null)}
          >
            <MenuItem onClick={handleExportCsv}>
              <DownloadIcon fontSize="small" sx={{ mr: 1 }} /> Download CSV
            </MenuItem>
            <MenuItem onClick={handleCopyTsv}>
              <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} /> {copied ? 'Copied to Clipboard!' : 'Copy to Clipboard (TSV)'}
            </MenuItem>
          </Menu>

          {onOpenStudio && (
            <MuiTooltip title="Open in Analytics Studio">
              <Button
                size="small"
                variant="outlined"
                endIcon={<LaunchIcon fontSize="small" />}
                onClick={() => onOpenStudio(chart)}
                sx={{ textTransform: 'none', fontSize: '0.8rem', borderColor: NET_PACIFIC_COLORS.primary }}
              >
                Studio
              </Button>
            </MuiTooltip>
          )}

          <Button
            onClick={() => setActiveView(isTable ? 'bar' : 'table')}
            size="small"
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, textTransform: 'none' }}
          >
            {isTable ? 'Show chart' : 'View as table'}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ p: 2 }}>
        {isTable ? (
          <TableContainer sx={{ maxHeight: 380 }}>
            <Table size="small" aria-label={`${chart.title} data table`} stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }}>Group</TableCell>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }} align="right">
                    {field.valueLabel}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, bgcolor: '#f8fafc' }} align="right">
                    Share
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const share = summary?.total ? ((row.value / summary.total) * 100).toFixed(1) : '0.0';
                  return (
                    <TableRow key={row.group} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{row.group}</TableCell>
                      <TableCell align="right">{dataService.formatCurrency(row.value)}</TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                        {share}%
                      </TableCell>
                    </TableRow>
                  );
                })}
                {summary && (
                  <TableRow sx={{ bgcolor: '#f1f5f9', fontWeight: 600 }}>
                    <TableCell sx={{ fontWeight: 700 }}>Total ({rows.length} groups)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {dataService.formatCurrency(summary.total)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      100.0%
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        ) : activeView === 'line' ? (
          <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 36)}>
            <LineChart data={rows} margin={{ top: 12, right: 24, bottom: 12, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="group"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(value: number) => dataService.formatCurrency(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.98)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                  fontSize: 12,
                }}
                formatter={(value: number) => [dataService.formatCurrency(value), field.valueLabel]}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={field.valueLabel}
                stroke={NET_PACIFIC_COLORS.primary}
                strokeWidth={3}
                dot={{ r: 4, fill: NET_PACIFIC_COLORS.secondary }}
                activeDot={{ r: 6, fill: NET_PACIFIC_COLORS.accent }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : activeView === 'area' ? (
          <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 36)}>
            <AreaChart data={rows} margin={{ top: 12, right: 24, bottom: 12, left: 16 }}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="group"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(value: number) => dataService.formatCurrency(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.98)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                  fontSize: 12,
                }}
                formatter={(value: number) => [dataService.formatCurrency(value), field.valueLabel]}
              />
              <Area
                type="monotone"
                dataKey="value"
                name={field.valueLabel}
                stroke={NET_PACIFIC_COLORS.primary}
                fillOpacity={1}
                fill="url(#areaGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : activeView === 'donut' || activeView === 'pie' ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [dataService.formatCurrency(value), field.valueLabel]}
                />
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="group"
                  cx="50%"
                  cy="50%"
                  innerRadius={activeView === 'donut' ? 55 : 0}
                  outerRadius={95}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {rows.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.group}`}
                      fill={CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center" sx={{ mt: 1, px: 2 }}>
              {rows.slice(0, 6).map((entry, index) => (
                <Chip
                  key={entry.group}
                  size="small"
                  sx={{
                    fontSize: '0.75rem',
                    bgcolor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    '&::before': {
                      content: '""',
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      mr: 0.5,
                      bgcolor: CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length],
                    },
                  }}
                  label={`${entry.group}: ${dataService.formatCurrency(entry.value)}`}
                />
              ))}
            </Stack>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 44)}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" horizontal={false} />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(value: number) => dataService.formatCurrency(value)}
              />
              <YAxis
                type="category"
                dataKey="group"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#334155' }}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  fontSize: 12,
                }}
                formatter={(value: number) => [dataService.formatCurrency(value), field.valueLabel]}
              />
              <Bar dataKey="value" radius={[0, 3, 3, 0]} name={field.valueLabel} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.group} fill={colorByGroup.get(row.group) || NET_PACIFIC_COLORS.primary} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Paper>
  );
}

function arePropsEqual(prev: AiChartPanelProps, next: AiChartPanelProps): boolean {
  if (prev.chart === next.chart) return true;
  if (!prev.chart || !next.chart) return false;
  return (
    prev.chart.tool === next.chart.tool
    && prev.chart.title === next.chart.title
    && prev.chart.type === next.chart.type
    && prev.chart.data === next.chart.data
  );
}

export default React.memo(AiChartPanel, arePropsEqual);
