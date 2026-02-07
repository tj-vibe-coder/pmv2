import React, { useState, useEffect, useMemo } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Alert,
  SelectChangeEvent,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import Grid from '@mui/material/GridLegacy';
import {
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart
} from 'recharts';
import { ExpandMore } from '@mui/icons-material';
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

interface ForecastData {
  period: string;
  actual?: number;
  predicted: number;
  confidence: number;
  upperBound: number;
  lowerBound: number;
}

interface ProjectForecast {
  projectId: number;
  projectName: string;
  currentProgress: number;
  predictedCompletion: Date;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedCost: number;
  actualCost: number;
  projectedFinalCost: number;
}

interface RevenueForecast {
  month: string;
  historicalRevenue: number;
  forecastedRevenue: number;
  billingSchedule: number;
  collections: number;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`forecasting-tabpanel-${index}`}
      aria-labelledby={`forecasting-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const Forecasting: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await dataService.getProjects({ year: selectedYear });
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedYear]);

  // Forecasting data - empty by default; in real app would come from ML/API
  const revenueForecastData = useMemo<RevenueForecast[]>(() => [], []);
  const projectForecasts = useMemo<ProjectForecast[]>(() => [], []);
  const cashFlowForecast = useMemo<ForecastData[]>(() => [], []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'error';
      default: return 'default';
    }
  };

  const handleYearChange = (event: SelectChangeEvent<number>) => {
    setSelectedYear(event.target.value as number);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Calculate forecast metrics
  const forecastMetrics = useMemo(() => {
    const totalForecastedRevenue = revenueForecastData.reduce((sum, item) => sum + item.forecastedRevenue, 0);
    const totalHistoricalRevenue = revenueForecastData.reduce((sum, item) => sum + (item.historicalRevenue || 0), 0);
    const growthRate = totalHistoricalRevenue > 0 ? ((totalForecastedRevenue - totalHistoricalRevenue) / totalHistoricalRevenue) * 100 : 0;

    const highRiskProjects = projectForecasts.filter(p => p.riskLevel === 'high').length;
    const avgConfidence = cashFlowForecast.length > 0
      ? cashFlowForecast.reduce((sum, item) => sum + item.confidence, 0) / cashFlowForecast.length
      : 0;

    return {
      totalForecastedRevenue,
      growthRate,
      highRiskProjects,
      avgConfidence
    };
  }, [revenueForecastData, projectForecasts, cashFlowForecast]);

  if (loading) {
    return (
      <Box sx={{ height: '100%' }}>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>Loading forecasting data...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Business Forecasting & Analytics
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5, fontWeight: 400 }}>
          Predictive Analytics and Revenue Forecasting Dashboard
        </Typography>
      </Box>

      {/* Filters */}
      <Box display="flex" gap={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Year</InputLabel>
          <Select value={selectedYear} onChange={handleYearChange} label="Year">
            {[2023, 2024, 2025, 2026].map(year => (
              <MenuItem key={year} value={year}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Forecasted Revenue</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {formatCurrency(forecastMetrics.totalForecastedRevenue)}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, fontSize: '0.75rem' }}>
                Next 12 months
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ 
            background: forecastMetrics.growthRate >= 0 
              ? `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)` 
              : `linear-gradient(135deg, ${NET_PACIFIC_COLORS.error} 0%, #fd79a8 100%)`, 
            color: 'white' 
          }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Growth Rate</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {forecastMetrics.growthRate >= 0 ? '+' : ''}{forecastMetrics.growthRate.toFixed(1)}%
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, fontSize: '0.75rem' }}>
                Year over year
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, color: '#2d3436', opacity: 0.8 }}>High Risk Projects</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, color: '#2d3436', lineHeight: 1.1 }}>
                {forecastMetrics.highRiskProjects}
              </Typography>
              <Typography variant="body2" sx={{ color: '#2d3436', opacity: 0.7, fontSize: '0.75rem' }}>
                Require attention
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Forecast Confidence</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {forecastMetrics.avgConfidence.toFixed(0)}%
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8, fontSize: '0.75rem' }}>
                Average accuracy
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Revenue Forecast" />
          <Tab label="Cash Flow" />
          <Tab label="Project Forecasts" />
          <Tab label="Risk Analysis" />
        </Tabs>
      </Box>

      {/* Revenue Forecast Tab */}
      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Revenue Forecast vs Historical Data</Typography>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={revenueForecastData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`} />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Bar dataKey="historicalRevenue" fill="#e0e0e0" name="Historical Revenue" />
                    <Line type="monotone" dataKey="forecastedRevenue" stroke="#1976d2" strokeWidth={3} name="Forecasted Revenue" />
                    <Line type="monotone" dataKey="billingSchedule" stroke="#388e3c" strokeDasharray="5 5" name="Billing Schedule" />
                    <Line type="monotone" dataKey="collections" stroke="#f57c00" strokeDasharray="3 3" name="Expected Collections" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Monthly Revenue Trend</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={revenueForecastData.slice(0, 6)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`} />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Area type="monotone" dataKey="forecastedRevenue" stroke="#1976d2" fill="#1976d2" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Key Metrics</Typography>
                <Box sx={{ mt: 2 }}>
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography>Total Forecasted Revenue (2025):</Typography>
                    <Typography sx={{ fontWeight: 'bold' }}>
                      {formatCurrency(revenueForecastData.reduce((sum, item) => sum + item.forecastedRevenue, 0))}
                    </Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography>Expected Collections:</Typography>
                    <Typography sx={{ fontWeight: 'bold' }}>
                      {formatCurrency(revenueForecastData.reduce((sum, item) => sum + item.collections, 0))}
                    </Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" mb={2}>
                    <Typography>Peak Revenue Month:</Typography>
                    <Typography sx={{ fontWeight: 'bold' }}>November 2025</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <Typography>Growth Rate (YoY):</Typography>
                    <Typography sx={{ fontWeight: 'bold', color: 'success.main' }}>
                      +{forecastMetrics.growthRate.toFixed(1)}%
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Cash Flow Tab */}
      <TabPanel value={tabValue} index={1}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Quarterly Cash Flow Forecast with Confidence Intervals</Typography>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={cashFlowForecast}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis tickFormatter={(value) => `₱${(value / 1000000).toFixed(1)}M`} />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Legend />
                    <Area dataKey="upperBound" fill="#e3f2fd" stroke="none" name="Upper Bound" />
                    <Area dataKey="lowerBound" fill="#ffffff" stroke="none" name="Lower Bound" />
                    <Bar dataKey="actual" fill="#388e3c" name="Actual" />
                    <Line type="monotone" dataKey="predicted" stroke="#1976d2" strokeWidth={3} name="Predicted" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Forecast Confidence Levels</Typography>
                {cashFlowForecast.map((item, index) => (
                  <Box key={index} mb={2}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="body1">{item.period}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.confidence}% confidence
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={item.confidence}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: '#f5f5f5',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: item.confidence >= 80 ? '#388e3c' : item.confidence >= 60 ? '#f57c00' : '#d32f2f',
                          borderRadius: 4
                        }
                      }}
                    />
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Cash Flow Insights</Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    Cash flow is expected to grow steadily with seasonal peaks in Q4.
                  </Typography>
                </Alert>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    Confidence levels decrease for longer-term forecasts. Monitor closely.
                  </Typography>
                </Alert>
                <Alert severity="success">
                  <Typography variant="body2">
                    Strong growth trajectory predicted for next 6 quarters.
                  </Typography>
                </Alert>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Project Forecasts Tab */}
      <TabPanel value={tabValue} index={2}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Project Completion Forecasts</Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Project Name</TableCell>
                        <TableCell>Current Progress</TableCell>
                        <TableCell>Predicted Completion</TableCell>
                        <TableCell>Risk Level</TableCell>
                        <TableCell align="right">Estimated Cost</TableCell>
                        <TableCell align="right">Actual Cost</TableCell>
                        <TableCell align="right">Projected Final Cost</TableCell>
                        <TableCell align="right">Variance</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {projectForecasts.map((forecast) => {
                        const variance = ((forecast.projectedFinalCost - forecast.estimatedCost) / forecast.estimatedCost) * 100;
                        return (
                          <TableRow key={forecast.projectId}>
                            <TableCell>{forecast.projectName}</TableCell>
                            <TableCell>
                              <Box display="flex" alignItems="center" gap={1}>
                                <LinearProgress
                                  variant="determinate"
                                  value={forecast.currentProgress}
                                  sx={{ width: 100, height: 8, borderRadius: 4 }}
                                />
                                <Typography variant="body2">{forecast.currentProgress}%</Typography>
                              </Box>
                            </TableCell>
                            <TableCell>{forecast.predictedCompletion.toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Chip
                                label={forecast.riskLevel.toUpperCase()}
                                color={getRiskColor(forecast.riskLevel) as any}
                                size="small"
                              />
                            </TableCell>
                            <TableCell align="right">{formatCurrency(forecast.estimatedCost)}</TableCell>
                            <TableCell align="right">{formatCurrency(forecast.actualCost)}</TableCell>
                            <TableCell align="right">{formatCurrency(forecast.projectedFinalCost)}</TableCell>
                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                color={variance > 10 ? 'error' : variance > 0 ? 'warning.main' : 'success.main'}
                              >
                                {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                              </Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Risk Analysis Tab */}
      <TabPanel value={tabValue} index={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>Risk Assessment & Mitigation</Typography>
          </Grid>
          
          {/* High Risk Projects */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom color="error">
                  High Risk Projects
                </Typography>
                {projectForecasts
                  .filter(p => p.riskLevel === 'high')
                  .map((project) => (
                    <Accordion key={project.projectId}>
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Box display="flex" justifyContent="space-between" width="100%">
                          <Typography>{project.projectName}</Typography>
                          <Chip label="HIGH RISK" color="error" size="small" />
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" paragraph>
                          <strong>Risk Factors:</strong>
                        </Typography>
                        <ul>
                          <li>Behind schedule (25% completion vs expected 40%)</li>
                          <li>Budget overrun risk (+18.75% projected)</li>
                          <li>Resource constraints</li>
                          <li>Client approval delays</li>
                        </ul>
                        <Typography variant="body2" paragraph sx={{ mt: 2 }}>
                          <strong>Recommended Actions:</strong>
                        </Typography>
                        <ul>
                          <li>Increase resource allocation</li>
                          <li>Expedite client communications</li>
                          <li>Review project scope and timeline</li>
                          <li>Implement weekly progress reviews</li>
                        </ul>
                      </AccordionDetails>
                    </Accordion>
                  ))}
              </CardContent>
            </Card>
          </Grid>

          {/* Medium Risk Projects */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ color: '#f57c00' }}>
                  Medium Risk Projects
                </Typography>
                {projectForecasts
                  .filter(p => p.riskLevel === 'medium')
                  .map((project) => (
                    <Accordion key={project.projectId}>
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Box display="flex" justifyContent="space-between" width="100%">
                          <Typography>{project.projectName}</Typography>
                          <Chip label="MEDIUM RISK" color="warning" size="small" />
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography variant="body2" paragraph>
                          <strong>Risk Factors:</strong>
                        </Typography>
                        <ul>
                          <li>Slight budget variance (+4% projected)</li>
                          <li>Dependency on external vendors</li>
                          <li>Weather-related delays possible</li>
                        </ul>
                        <Typography variant="body2" paragraph sx={{ mt: 2 }}>
                          <strong>Monitoring Points:</strong>
                        </Typography>
                        <ul>
                          <li>Monthly budget reviews</li>
                          <li>Vendor performance tracking</li>
                          <li>Weather contingency planning</li>
                        </ul>
                      </AccordionDetails>
                    </Accordion>
                  ))}
              </CardContent>
            </Card>
          </Grid>

          {/* Risk Metrics */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Risk Metrics Dashboard</Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}>
                    <Box textAlign="center" p={2}>
                      <Typography variant="h3" color="error" sx={{ fontWeight: 'bold' }}>
                        {projectForecasts.filter(p => p.riskLevel === 'high').length}
                      </Typography>
                      <Typography variant="body1">High Risk Projects</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Box textAlign="center" p={2}>
                      <Typography variant="h3" sx={{ color: '#f57c00', fontWeight: 'bold' }}>
                        {projectForecasts.filter(p => p.riskLevel === 'medium').length}
                      </Typography>
                      <Typography variant="body1">Medium Risk Projects</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Box textAlign="center" p={2}>
                      <Typography variant="h3" color="success.main" sx={{ fontWeight: 'bold' }}>
                        {projectForecasts.filter(p => p.riskLevel === 'low').length}
                      </Typography>
                      <Typography variant="body1">Low Risk Projects</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>
    </Box>
  );
};

export default Forecasting;
