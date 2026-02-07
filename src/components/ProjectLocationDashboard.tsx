import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Grid,
} from '@mui/material';
import { 
  Business as BusinessIcon,
  AccountBalance as AccountIcon,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Project } from '../types/Project';
import dataService from '../services/dataService';

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

// Bar chart colors - different shades of blue
const BAR_CHART_COLORS = [
  '#1a365d', // Dark blue
  '#2c5aa0', // Primary blue (Net Pacific)
  '#3182ce', // Medium blue
  '#4299e1', // Light blue
  '#63b3ed', // Lighter blue
  '#90cdf4', // Pale blue
  '#bee3f8', // Very light blue
  '#e6f3ff', // Lightest blue
];

interface ClientData {
  client: string;
  projectCount: number;
  totalValue: number;
  totalBilled: number;
  totalBacklogs: number;
}

interface ProjectClientDashboardProps {}

const ProjectLocationDashboard: React.FC<ProjectClientDashboardProps> = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>('');

  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);
      try {
        const data = await dataService.getProjects();
        setProjects(data);
      } catch (error) {
        console.error('Error loading projects:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadProjects();
  }, []);

  // Process data for client analysis - filter by selected client
  const clientData = useMemo(() => {
    const clientMap = new Map<string, ClientData>();
    
    let filteredProjects = projects;
    if (selectedClient) {
      filteredProjects = filteredProjects.filter(p => p.account_name === selectedClient);
    }
    
    filteredProjects.forEach(project => {
      if (!project.account_name) return;
      
      const client = project.account_name;
      const existing = clientMap.get(client);
      const unbilled = dataService.getUnbilled(project);
      if (existing) {
        existing.projectCount++;
        existing.totalValue += project.updated_contract_amount || 0;
        existing.totalBilled += project.contract_billed || 0;
        existing.totalBacklogs += unbilled;
      } else {
        clientMap.set(client, {
          client,
          projectCount: 1,
          totalValue: project.updated_contract_amount || 0,
          totalBilled: project.contract_billed || 0,
          totalBacklogs: unbilled,
        });
      }
    });
    
    return Array.from(clientMap.values())
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [projects, selectedClient]);

  // Table data: when client selected show projects for that client; otherwise show client summary
  const filteredData = useMemo(() => {
    if (selectedClient) {
      return projects
        .filter(p => p.account_name === selectedClient)
        .map(project => ({
          client: `${project.project_name}`,
          projectCount: 1,
          totalValue: project.updated_contract_amount || 0,
          totalBilled: project.contract_billed || 0,
          totalBacklogs: dataService.getUnbilled(project),
        }))
        .sort((a, b) => b.totalValue - a.totalValue);
    }
    return clientData.map(c => ({
      client: c.client,
      projectCount: c.projectCount,
      totalValue: c.totalValue,
      totalBilled: c.totalBilled,
      totalBacklogs: c.totalBacklogs,
    }));
  }, [clientData, selectedClient, projects]);

  const uniqueClients = useMemo(() => {
    const clients = new Set(projects.map(p => p.account_name).filter(Boolean));
    return Array.from(clients).sort();
  }, [projects]);

  // Prepare chart data - different logic when client is selected
  const chartData = useMemo(() => {
    if (selectedClient) {
      return projects
        .filter(p => p.account_name === selectedClient)
        .map(project => ({
          client: `${project.project_name}`,
          projectCount: 1,
          totalValue: project.updated_contract_amount || 0,
          totalBilled: project.contract_billed || 0,
          totalBacklogs: dataService.getUnbilled(project),
        }))
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, 8);
    }
    return clientData.slice(0, 8);
  }, [clientData, selectedClient, projects]);

  const topClients = chartData;

  // Process data for category analysis
  const categoryData = useMemo(() => {
    const categoryMap = new Map<string, { category: string; projectCount: number; totalValue: number; totalBilled: number; totalBacklogs: number }>();
    
    projects.forEach(project => {
      if (!project.project_category) return;
      
      const category = project.project_category;
      const existing = categoryMap.get(category);
      const unbilled = dataService.getUnbilled(project);
      if (existing) {
        existing.projectCount++;
        existing.totalValue += project.updated_contract_amount || 0;
        existing.totalBilled += project.contract_billed || 0;
        existing.totalBacklogs += unbilled;
      } else {
        categoryMap.set(category, {
          category,
          projectCount: 1,
          totalValue: project.updated_contract_amount || 0,
          totalBilled: project.contract_billed || 0,
          totalBacklogs: unbilled,
        });
      }
    });
    
    return Array.from(categoryMap.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 8); // Top 8 categories
  }, [projects]);

  // Summary stats
  const totalProjects = projects.length;
  const totalValue = projects.reduce((sum, p) => sum + (p.updated_contract_amount || 0), 0);
  const uniqueClientCount = uniqueClients.length;

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Loading project client data...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Contract Value Analysis by Client
        </Typography>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <BusinessIcon sx={{ mr: 1 }} />
                <Typography variant="body2">Total Projects</Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {totalProjects.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <AccountIcon sx={{ mr: 1 }} />
                <Typography variant="body2">Clients</Typography>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {uniqueClientCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
            <CardContent sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2">Total Value</Typography>
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {dataService.formatCurrency(totalValue)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Filter by Client</InputLabel>
              <Select
                value={selectedClient}
                onChange={(e: SelectChangeEvent) => setSelectedClient(e.target.value)}
                label="Filter by Client"
              >
                <MenuItem value="">All Clients</MenuItem>
                {uniqueClients.map(client => (
                  <MenuItem key={client} value={client}>{client}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Charts - Side by Side */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {/* Contract Value by Client Chart */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ 
            p: 2, 
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              {selectedClient ? 'Contract Value by Project (Top 8)' : 'Contract Value by Client (Top 8)'}
              {selectedClient && (
                <Typography component="span" sx={{ ml: 1, fontSize: '0.75rem', color: '#6b7280', fontWeight: 400 }}>
                  ({selectedClient})
                </Typography>
              )}
            </Typography>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={topClients}
                margin={{ top: 20, right: 10, left: 10, bottom: 80 }}
              >
                <defs>
                  {BAR_CHART_COLORS.map((color, index) => (
                    <linearGradient key={`gradient-${index}`} id={`barGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0.3}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis 
                  dataKey="client" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <YAxis 
                  tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: '#64748b' }}
                />
                <Tooltip 
                  formatter={(value: number) => [dataService.formatCurrency(value), 'Contract Value']}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="totalValue" radius={[3, 3, 0, 0]}>
                  {topClients.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={`url(#barGradient${index % BAR_CHART_COLORS.length})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Contract Value by Category Chart */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ 
            p: 2, 
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
              Contract Value by Category (Top 8)
            </Typography>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={categoryData}
                margin={{ top: 20, right: 10, left: 10, bottom: 60 }}
              >
                <defs>
                  {BAR_CHART_COLORS.map((color, index) => (
                    <linearGradient key={`categoryGradient-${index}`} id={`categoryGradient${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0.3}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis 
                  dataKey="category" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                />
                <YAxis 
                  tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: '#64748b' }}
                />
                <Tooltip 
                  formatter={(value: number) => [dataService.formatCurrency(value), 'Contract Value']}
                  labelFormatter={(label) => `Category: ${label}`}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="totalValue" radius={[3, 3, 0, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={`url(#categoryGradient${index % BAR_CHART_COLORS.length})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Client Analysis Table */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: NET_PACIFIC_COLORS.primary }}>
          {selectedClient ? 'Project Details' : 'Client Analysis'}
          <Typography component="span" sx={{ ml: 1, fontSize: '0.9rem', color: 'text.secondary' }}>
            ({filteredData.length} results)
          </Typography>
        </Typography>
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{selectedClient ? 'Project' : 'Client'}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{selectedClient ? 'Project Count' : 'Projects'}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Contract Value</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Backlogs</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Completion %</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredData.slice(0, 50).map((item, index) => {
                const completionRate = item.totalValue > 0 ? (item.totalBilled / item.totalValue * 100) : 0;
                return (
                  <TableRow key={`${item.client}-${index}`} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {item.client}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {item.projectCount}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {dataService.formatCurrency(item.totalValue)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {dataService.formatCurrency(item.totalBacklogs ?? 0)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          color: completionRate > 80 ? NET_PACIFIC_COLORS.success : 
                                 completionRate > 60 ? NET_PACIFIC_COLORS.warning : 
                                 NET_PACIFIC_COLORS.error
                        }}
                      >
                        {completionRate.toFixed(1)}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        {filteredData.length > 50 && (
          <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
            Showing top 50 results. Use filters to narrow down the data.
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default ProjectLocationDashboard;