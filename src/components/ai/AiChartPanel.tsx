import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import dataService from '../../services/dataService';
import type { AiChart } from '../../types/AiAssist';

// Matches the NET_PACIFIC_COLORS constant redeclared per-page across this app
// (see docs/DESIGN_PHILOSOPHY.md §2 / src/components/Dashboard.tsx).
const NET_PACIFIC_COLORS = {
  primary: '#2c5aa0',
  secondary: '#1e4a72',
};
const SEQUENTIAL_LIGHT = '#c9dbf0';

// This data's job is a magnitude comparison across a handful of groups — one
// series, not several — so color is sequential (one hue, more-is-darker),
// never a categorical rainbow. See the dataviz skill's choosing-a-form guide.
const CHART_FIELD_BY_TOOL: Record<string, { valueKey: string; valueLabel: string }> = {
  get_portfolio_summary: { valueKey: 'totalBalance', valueLabel: 'Remaining balance' },
  get_expense_summary: { valueKey: 'totalAmount', valueLabel: 'Total expense' },
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
}

function AiChartPanel({ chart }: AiChartPanelProps): React.ReactElement | null {
  const [showTable, setShowTable] = useState(false);
  const field = chart ? CHART_FIELD_BY_TOOL[chart.tool] : undefined;

  const rows = useMemo(() => {
    if (!chart || !field) return [];
    return chart.data
      .map((row) => ({
        group: typeof row.group === 'string' ? row.group : String(row.group ?? '—'),
        value: Number(row[field.valueKey]) || 0,
      }));
  }, [chart, field]);

  const colorByGroup = useMemo(() => {
    // Ascending so the highest value lands at t=1 (darkest) — "more is darker".
    const rankedAsc = [...rows].sort((a, b) => a.value - b.value).map((r) => r.group);
    const map = new Map<string, string>();
    rankedAsc.forEach((group, index) => {
      const t = rankedAsc.length > 1 ? index / (rankedAsc.length - 1) : 1;
      map.set(group, mixHex(SEQUENTIAL_LIGHT, NET_PACIFIC_COLORS.secondary, t));
    });
    return map;
  }, [rows]);

  if (!chart || !field || rows.length === 0) return null;

  return (
    <Paper
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e2e8f0',
      }}
    >
      <Box sx={{ p: 1.5, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
          {chart.title}
        </Typography>
        <Button onClick={() => setShowTable((prev) => !prev)} size="small">
          {showTable ? 'Show chart' : 'View as table'}
        </Button>
      </Box>
      <Box sx={{ p: 2 }}>
        {showTable ? (
          <TableContainer>
            <Table size="small" aria-label={`${chart.title} data table`}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Group</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">{field.valueLabel}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.group}>
                    <TableCell>{row.group}</TableCell>
                    <TableCell align="right">{dataService.formatCurrency(row.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
