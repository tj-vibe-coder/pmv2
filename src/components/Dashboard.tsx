import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Grid,
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
  Chip,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Button,
  Stack,
  Checkbox,
  Menu,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Alert,
} from '@mui/material';
import { 
  Visibility as VisibilityIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  TableChart as ExcelIcon,
  Description as CsvIcon,
  KeyboardArrowDown as ArrowDownIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  Add as AddIcon,
  ArrowUpward as ArrowUpIcon,
  UnfoldMore as UnfoldMoreIcon,
} from '@mui/icons-material';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from 'recharts';
import { Project, ProjectFilters, YearSummary } from '../types/Project';
import dataService from '../services/dataService';
import AddProjectDialog from './AddProjectDialog';
import { getBudgets } from '../utils/projectBudgetStorage';

const PROJECT_EXPENSES_KEY = 'projectExpenses';
function loadProjectExpenses(): { projectId: number; amount: number }[] {
  try {
    const raw = localStorage.getItem(PROJECT_EXPENSES_KEY);
    if (raw) return JSON.parse(raw).map((e: { projectId: number; amount: number }) => ({ projectId: e.projectId, amount: e.amount }));
  } catch (_) {}
  return [];
}

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

interface DashboardProps {
  onProjectSelect: (project: Project) => void;
  refreshTrigger?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ onProjectSelect, refreshTrigger: externalRefreshTrigger = 0 }) => {
  const [filters, setFilters] = useState<ProjectFilters>({});
  const [selectedProjects, setSelectedProjects] = useState<Set<number>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const effectiveRefreshTrigger = externalRefreshTrigger + refreshTrigger;
  const [sortConfig, setSortConfig] = useState<{key: string; direction: 'asc' | 'desc'} | null>(null);

  // Sorting function
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Sort icon component
  const getSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <UnfoldMoreIcon sx={{ fontSize: '0.875rem', ml: 0.5, opacity: 0.5 }} />;
    }
    return sortConfig.direction === 'asc' ? 
      <ArrowUpIcon sx={{ fontSize: '0.875rem', ml: 0.5 }} /> : 
      <ArrowDownIcon sx={{ fontSize: '0.875rem', ml: 0.5 }} />;
  };
  const [, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [addProjectDialogOpen, setAddProjectDialogOpen] = useState(false);
  const [yearSummaries, setYearSummaries] = useState<YearSummary[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<{name: string, value: number}[]>([]);
  const [uniqueStatuses, setUniqueStatuses] = useState<string[]>([]);
  const [uniqueYears, setUniqueYears] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load projects on component mount and when filters/refresh change
  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);
      try {
        const data = await dataService.getProjects(filters);
        setProjects(data);
      } catch (error) {
        console.error('Error loading projects:', error);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [filters, effectiveRefreshTrigger]);
  
  // Load static data on mount
  useEffect(() => {
    const loadStaticData = async () => {
      try {
        const [statusDist, statuses, years] = await Promise.all([
          dataService.getStatusDistribution(),
          dataService.getUniqueStatuses(),
          dataService.getUniqueYears()
        ]);
        
        const allProjects = await dataService.getProjects();
        const yearGroups: Record<number, typeof allProjects> = {};
        
        allProjects.forEach(project => {
          const year = project.year || new Date().getFullYear();
          if (!yearGroups[year]) yearGroups[year] = [];
          yearGroups[year].push(project);
        });
        
        const calculatedYearSummaries = Object.entries(yearGroups).map(([year, projects]) => ({
          year: parseInt(year),
          projectCount: projects.length,
          totalContractAmount: projects.reduce((sum, p) => sum + (p.updated_contract_amount || 0), 0),
          totalBilledAmount: projects.reduce((sum, p) => sum + (p.contract_billed || 0), 0),
          totalBacklogs: projects.reduce((sum, p) => sum + dataService.getUnbilled(p), 0),
          totalOutstandingBalance: projects.reduce((sum, p) => sum + (p.updated_contract_balance_net || 0), 0)
        })).sort((a, b) => a.year - b.year);
        
        setYearSummaries(calculatedYearSummaries);
        setStatusDistribution(statusDist.map(item => ({ name: item.label, value: item.value })));
        setUniqueStatuses(statuses);
        setUniqueYears(years);
      } catch (error) {
        console.error('Error loading static data:', error);
      }
    };
    loadStaticData();
  }, [refreshTrigger]);
  
  // Since we're now filtering server-side, filteredProjects is projects with client-side sorting
  const filteredProjects = useMemo(() => {
    if (!sortConfig) return projects;
    
    const sortedProjects = [...projects].sort((a, b) => {
      // Backlogs = unbilled amount (sort by computed value)
      if (sortConfig.key === 'backlogs') {
        const aVal = dataService.getUnbilled(a);
        const bVal = dataService.getUnbilled(b);
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      const aVal = a[sortConfig.key as keyof Project];
      const bVal = b[sortConfig.key as keyof Project];
      
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      // Handle numbers
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // Handle strings
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sortedProjects;
  }, [projects, sortConfig]);

  // Calculate summary data based on all applied filters (Backlogs = unbilled amount)
  const summary = useMemo(() => {
    return {
      projectCount: filteredProjects.length,
      totalContractAmount: filteredProjects.reduce((sum, p) => sum + (p.updated_contract_amount || 0), 0),
      totalBilledAmount: filteredProjects.reduce((sum, p) => sum + (p.contract_billed || 0), 0),
      totalBacklogs: filteredProjects.reduce((sum, p) => sum + dataService.getUnbilled(p), 0),
      totalOutstandingBalance: filteredProjects.reduce((sum, p) => sum + (p.updated_contract_balance_net || 0), 0),
    };
  }, [filteredProjects]);

  // Project health from budget vs expenses (localStorage)
  const projectHealthMap = useMemo(() => {
    const budgets = getBudgets();
    const expenses = loadProjectExpenses();
    const spentByProject: Record<number, number> = {};
    expenses.forEach((e) => {
      spentByProject[e.projectId] = (spentByProject[e.projectId] || 0) + e.amount;
    });
    const map: Record<number, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {};
    filteredProjects.forEach((p) => {
      const budget = budgets[p.id] ?? 0;
      const spent = spentByProject[p.id] ?? 0;
      const remaining = budget - spent;
      const remainingPct = budget > 0 ? (remaining / budget) * 100 : 100;
      if (budget <= 0) {
        map[p.id] = { label: '—', color: 'default' };
      } else if (remaining < 0) {
        map[p.id] = { label: 'Over', color: 'error' };
      } else if (remainingPct <= 20) {
        map[p.id] = { label: 'At risk', color: 'warning' };
      } else {
        map[p.id] = { label: 'Healthy', color: 'success' };
      }
    });
    return map;
  }, [filteredProjects]);

  // Handle filter changes
  const handleFilterChange = (field: keyof ProjectFilters) => (event: SelectChangeEvent<string>) => {
    setFilters(prev => ({
      ...prev,
      [field]: event.target.value || undefined
    }));
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters(prev => ({
      ...prev,
      searchTerm: event.target.value || undefined
    }));
  };
  
  // Handle project selection
  const handleProjectSelection = (projectId: number, isSelected: boolean) => {
    const newSelected = new Set(selectedProjects);
    if (isSelected) {
      newSelected.add(projectId);
    } else {
      newSelected.delete(projectId);
    }
    setSelectedProjects(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedProjects(new Set(filteredProjects.map(p => p.id)));
      setShowBulkActions(true);
    } else {
      setSelectedProjects(new Set());
      setShowBulkActions(false);
    }
  };

  // Import from CSV/Excel
  const importFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        console.log('Import started - Headers:', headers);
        console.log('Total rows:', lines.length - 1);
        
        const importedProjects: Partial<Project>[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const project: any = {};
          
          headers.forEach((header, index) => {
            const value = values[index];
            
            // Map headers to project properties
            switch (header.toLowerCase()) {
              case 'id':
                project.id = parseInt(value) || 0;
                break;
              case 'item no':
                project.item_no = parseInt(value) || 0;
                break;
              case 'year':
                project.year = parseInt(value) || new Date().getFullYear();
                break;
              case 'am':
                project.am = value;
                break;
              case 'ovp number':
                project.ovp_number = value;
                break;
              case 'po number':
                project.po_number = value;
                break;
              case 'client status':
                project.client_status = value;
                break;
              case 'account name':
                project.account_name = value;
                break;
              case 'project name':
                project.project_name = value;
                break;
              case 'project category':
                project.project_category = value;
                break;
              case 'project location':
                project.project_location = value;
                break;
              case 'scope of work':
                project.scope_of_work = value;
                break;
              case 'qtn no':
                project.qtn_no = value;
                break;
              case 'ovp category':
                project.ovp_category = value;
                break;
              case 'contract amount':
                project.contract_amount = parseFloat(value) || 0;
                break;
              case 'updated contract amount':
                project.updated_contract_amount = parseFloat(value) || 0;
                break;
              case 'project status':
                project.project_status = value;
                break;
              case 'contract billed':
                project.contract_billed = parseFloat(value) || 0;
                break;
              case 'updated contract balance net':
                project.updated_contract_balance_net = parseFloat(value) || 0;
                break;
              // Add more field mappings as needed
              default:
                // Handle other fields dynamically
                const fieldName = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
                if (value !== undefined) {
                  project[fieldName] = isNaN(parseFloat(value)) ? value : parseFloat(value);
                }
            }
          });
          
          if (project.project_name) {
            importedProjects.push(project);
          }
        }
        
        console.log(`Successfully imported ${importedProjects.length} projects`);
        
        // Actually add the imported projects to the data service
        const addResult = await dataService.addProjects(importedProjects);
        
        if (addResult.success) {
          // Trigger data refresh to show new projects in UI
          setRefreshTrigger(prev => prev + 1);
          
          const message = addResult.errors.length > 0 
            ? `Successfully imported ${addResult.count || 0} projects from ${file.name}. Issues: ${addResult.errors.slice(0, 3).join(', ')}`
            : `Successfully imported ${addResult.count || 0} projects from ${file.name}`;
          
          alert(message);
          console.log(`Total projects now: ${dataService.getProjectCount()}`);
        } else {
          throw new Error(`Import failed: ${addResult.errors.join(', ')}`);
        }
        
      } catch (error) {
        console.error('Import error:', error);
        alert('Error importing file. Please check the format and try again.');
      }
    };
    
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Trigger file import
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  // Handle project added callback
  const handleProjectAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Bulk delete functionality
  const handleBulkDelete = async () => {
    setIsDeleting(true);
    
    try {
      const selectedProjectIds = Array.from(selectedProjects);
      const selectedProjectNames = filteredProjects
        .filter(p => selectedProjectIds.includes(p.id))
        .map(p => p.project_name);
      
      console.log('Deleting projects with IDs:', selectedProjectIds);
      console.log('Project names:', selectedProjectNames);
      
      // Simulate brief loading for better UX
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Actually delete the projects from the data service
      const deleteResult = await dataService.deleteProjects(selectedProjectIds);
      
      if (deleteResult.success) {
        // Clear selection and close dialog
        setSelectedProjects(new Set());
        setShowBulkActions(false);
        setDeleteDialogOpen(false);
        
        // Show success message  
        const deletedCount = Array.from(selectedProjects).length;
        const message = deleteResult.errors.length > 0 
          ? `Successfully deleted ${deletedCount} project(s). ${deleteResult.errors.join(', ')}`
          : `Successfully deleted ${deletedCount} project(s)`;
        
        alert(message);
        
        // Force component re-render by triggering data refresh
        setRefreshTrigger(prev => prev + 1);
        console.log(`Projects remaining: ${dataService.getProjectCount()}`);
        
      } else {
        throw new Error(deleteResult.errors.join(', ') || 'Delete operation failed');
      }
      
    } catch (error) {
      console.error('Error deleting projects:', error);
      alert(`Error deleting projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Open delete confirmation dialog
  const handleDeleteConfirmation = () => {
    setDeleteDialogOpen(true);
  };

  // Cancel delete operation
  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  // Enhanced CSV export with all fields
  const exportToCSV = () => {
    // Function to escape CSV values properly
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // If value contains comma, double quote, or newline, wrap in quotes and escape internal quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Define headers in exact order
    const headers = [
      'ID',
      'Item No', 
      'Year',
      'AM',
      'OVP Number',
      'PO Number',
      'PO Date',
      'Client Status',
      'Client',
      'Project Name',
      'Project Category',
      'Project Location',
      'Scope of Work',
      'QTN No',
      'OVP Category',
      'Contract Amount',
      'Updated Contract Amount',
      'Down Payment %',
      'Retention %',
      'Start Date',
      'Duration Days',
      'Completion Date',
      'Payment Schedule',
      'Payment Terms',
      'Bonds Requirement',
      'Client Approver',
      'Progress Billing Schedule',
      'Mobilization Date',
      'Updated Completion Date',
      'Project Status',
      'Actual Site Progress %',
      'Actual Progress',
      'Evaluated Progress %',
      'Evaluated Progress',
      'For RFB %',
      'For RFB Amount',
      'RFB Date',
      'Type of RFB',
      'Work in Progress AP',
      'Work in Progress EP',
      'Updated Contract Balance %',
      'Total Contract Balance',
      'Updated Contract Balance Net %',
      'Updated Contract Balance Net',
      'Remarks',
      'Contract Billed Gross %',
      'Contract Billed',
      'Contract Billed Net %',
      'Amount Contract Billed Net',
      'For Retention Billing %',
      'Amount for Retention Billing',
      'Retention Status',
      'Unevaluated Progress',
      'Created At',
      'Updated At'
    ];

    // Create CSV content with properly aligned data
    const csvContent = [
      headers.join(','),
      ...filteredProjects.map(project => {
        const row = [
          escapeCSV(project.id || ''),
          escapeCSV(project.item_no || ''),
          escapeCSV(project.year || ''),
          escapeCSV(project.am || ''),
          escapeCSV(project.ovp_number || ''),
          escapeCSV(project.po_number || ''),
          escapeCSV(project.po_date ? dataService.formatDate(project.po_date) : ''),
          escapeCSV(project.client_status || ''),
          escapeCSV(project.account_name || ''),
          escapeCSV(project.project_name || ''),
          escapeCSV(project.project_category || ''),
          escapeCSV(project.project_location || ''),
          escapeCSV(project.scope_of_work || ''),
          escapeCSV(project.qtn_no || ''),
          escapeCSV(project.ovp_category || ''),
          escapeCSV(project.contract_amount || 0),
          escapeCSV(project.updated_contract_amount || 0),
          escapeCSV(project.down_payment_percent || 0),
          escapeCSV(project.retention_percent || 0),
          escapeCSV(project.start_date ? dataService.formatDate(project.start_date) : ''),
          escapeCSV(project.duration_days || 0),
          escapeCSV(project.completion_date ? dataService.formatDate(project.completion_date) : ''),
          escapeCSV(project.payment_schedule || ''),
          escapeCSV(project.payment_terms || ''),
          escapeCSV(project.bonds_requirement || ''),
          escapeCSV(project.client_approver || ''),
          escapeCSV(project.progress_billing_schedule || ''),
          escapeCSV(project.mobilization_date ? dataService.formatDate(project.mobilization_date) : ''),
          escapeCSV(project.updated_completion_date ? dataService.formatDate(project.updated_completion_date) : ''),
          escapeCSV(project.project_status || ''),
          escapeCSV(project.actual_site_progress_percent || 0),
          escapeCSV(project.actual_progress || 0),
          escapeCSV(project.evaluated_progress_percent || 0),
          escapeCSV(project.evaluated_progress || 0),
          escapeCSV(project.for_rfb_percent || 0),
          escapeCSV(project.for_rfb_amount || 0),
          escapeCSV(project.rfb_date ? dataService.formatDate(project.rfb_date) : ''),
          escapeCSV(project.type_of_rfb || ''),
          escapeCSV(project.work_in_progress_ap || 0),
          escapeCSV(project.work_in_progress_ep || 0),
          escapeCSV(project.updated_contract_balance_percent || 0),
          escapeCSV(project.total_contract_balance || 0),
          escapeCSV(project.updated_contract_balance_net_percent || 0),
          escapeCSV(project.updated_contract_balance_net || 0),
          escapeCSV(project.remarks || ''),
          escapeCSV(project.contract_billed_gross_percent || 0),
          escapeCSV(project.contract_billed || 0),
          escapeCSV(project.contract_billed_net_percent || 0),
          escapeCSV(project.amount_contract_billed_net || 0),
          escapeCSV(project.for_retention_billing_percent || 0),
          escapeCSV(project.amount_for_retention_billing || 0),
          escapeCSV(project.retention_status || ''),
          escapeCSV(project.unevaluated_progress || 0),
          escapeCSV(project.created_at || ''),
          escapeCSV(project.updated_at || '')
        ];
        
        return row.join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projects_complete_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Excel export function
  const exportToExcel = () => {
    // Same headers as CSV for consistency
    const headers = [
      'ID',
      'Item No', 
      'Year',
      'AM',
      'OVP Number',
      'PO Number',
      'PO Date',
      'Client Status',
      'Client',
      'Project Name',
      'Project Category',
      'Project Location',
      'Scope of Work',
      'QTN No',
      'OVP Category',
      'Contract Amount',
      'Updated Contract Amount',
      'Down Payment %',
      'Retention %',
      'Start Date',
      'Duration Days',
      'Completion Date',
      'Payment Schedule',
      'Payment Terms',
      'Bonds Requirement',
      'Client Approver',
      'Progress Billing Schedule',
      'Mobilization Date',
      'Updated Completion Date',
      'Project Status',
      'Actual Site Progress %',
      'Actual Progress',
      'Evaluated Progress %',
      'Evaluated Progress',
      'For RFB %',
      'For RFB Amount',
      'RFB Date',
      'Type of RFB',
      'Work in Progress AP',
      'Work in Progress EP',
      'Updated Contract Balance %',
      'Total Contract Balance',
      'Updated Contract Balance Net %',
      'Updated Contract Balance Net',
      'Remarks',
      'Contract Billed Gross %',
      'Contract Billed',
      'Contract Billed Net %',
      'Amount Contract Billed Net',
      'For Retention Billing %',
      'Amount for Retention Billing',
      'Retention Status',
      'Unevaluated Progress',
      'Created At',
      'Updated At'
    ];

    // Create BOM for Excel UTF-8 recognition
    const BOM = '\uFEFF';
    
    const csvContent = BOM + [
      headers.join('\t'), // Use tabs for better Excel compatibility
      ...filteredProjects.map(project => {
        const row = [
          project.id || '',
          project.item_no || '',
          project.year || '',
          project.am || '',
          project.ovp_number || '',
          project.po_number || '',
          project.po_date ? dataService.formatDate(project.po_date) : '',
          project.client_status || '',
          project.account_name || '',
          project.project_name || '',
          project.project_category || '',
          project.project_location || '',
          project.scope_of_work || '',
          project.qtn_no || '',
          project.ovp_category || '',
          project.contract_amount || 0,
          project.updated_contract_amount || 0,
          project.down_payment_percent || 0,
          project.retention_percent || 0,
          project.start_date ? dataService.formatDate(project.start_date) : '',
          project.duration_days || 0,
          project.completion_date ? dataService.formatDate(project.completion_date) : '',
          project.payment_schedule || '',
          project.payment_terms || '',
          project.bonds_requirement || '',
          project.client_approver || '',
          project.progress_billing_schedule || '',
          project.mobilization_date ? dataService.formatDate(project.mobilization_date) : '',
          project.updated_completion_date ? dataService.formatDate(project.updated_completion_date) : '',
          project.project_status || '',
          project.actual_site_progress_percent || 0,
          project.actual_progress || 0,
          project.evaluated_progress_percent || 0,
          project.evaluated_progress || 0,
          project.for_rfb_percent || 0,
          project.for_rfb_amount || 0,
          project.rfb_date ? dataService.formatDate(project.rfb_date) : '',
          project.type_of_rfb || '',
          project.work_in_progress_ap || 0,
          project.work_in_progress_ep || 0,
          project.updated_contract_balance_percent || 0,
          project.total_contract_balance || 0,
          project.updated_contract_balance_net_percent || 0,
          project.updated_contract_balance_net || 0,
          project.remarks || '',
          project.contract_billed_gross_percent || 0,
          project.contract_billed || 0,
          project.contract_billed_net_percent || 0,
          project.amount_contract_billed_net || 0,
          project.for_retention_billing_percent || 0,
          project.amount_for_retention_billing || 0,
          project.retention_status || '',
          project.unevaluated_progress || 0,
          project.created_at || '',
          project.updated_at || ''
        ];
        
        return row.join('\t');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projects_excel_${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Render dashboard
  return (
    <Box sx={{ height: '100%', overflow: 'hidden' }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          Project Monitoring Dashboard
        </Typography>
      </Box>
      
      {/* KPI Cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.primary} 0%, ${NET_PACIFIC_COLORS.accent1} 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Total Projects</Typography>
              <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {summary.projectCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.success} 0%, #55efc4 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Contract Value</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {dataService.formatCurrency(summary.totalContractAmount).replace('₱', '₱')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.info} 0%, #a29bfe 100%)`, color: 'white' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>Backlogs</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                {dataService.formatCurrency(summary.totalBacklogs).replace('₱', '₱')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ background: `linear-gradient(135deg, ${NET_PACIFIC_COLORS.warning} 0%, #ffeaa7 100%)`, color: '#2d3436' }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5, color: '#2d3436', opacity: 0.8 }}>Outstanding</Typography>
              <Typography variant="h5" component="div" sx={{ fontWeight: 700, color: '#2d3436', lineHeight: 1.1 }}>
                {dataService.formatCurrency(summary.totalOutstandingBalance).replace('₱', '₱')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Financial Performance Overview & Status Distribution */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ 
            p: 2, 
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#2c5aa0' }}>
              Financial Performance Overview with S-Curve Trend
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={yearSummaries.map((summary, index, arr) => {
                  let cumulativeContracts = 0;
                  let cumulativeBilled = 0;
                  for (let i = 0; i <= index; i++) {
                    cumulativeContracts += arr[i].totalContractAmount;
                    cumulativeBilled += arr[i].totalBilledAmount;
                  }
                  return {
                    ...summary,
                    cumulativeContracts,
                    cumulativeBilled,
                    completionPercentage: cumulativeContracts > 0 ? (cumulativeBilled / cumulativeContracts * 100) : 0
                  };
                })}
                margin={{ top: 20, right: 80, bottom: 5, left: 20 }}
              >
                <defs>
                  <linearGradient id="contractGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={NET_PACIFIC_COLORS.primary} stopOpacity={0.3}/>
                  </linearGradient>
                  <linearGradient id="billedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={NET_PACIFIC_COLORS.success} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={NET_PACIFIC_COLORS.success} stopOpacity={0.3}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis 
                  dataKey="year" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis 
                  yAxisId="left"
                  orientation="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(value) => dataService.formatCurrency(value).replace('₱', '₱')}
                  width={80}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(value) => `${value}%`}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    fontSize: '12px'
                  }}
                  formatter={(value: number, name: string, props: any) => {
                    let label = '';
                    let formattedValue = '';
                    
                    if (name === 'totalContractAmount') {
                      label = 'Contract Amount';
                      formattedValue = dataService.formatCurrency(value);
                    } else if (name === 'totalBacklogs') {
                      label = 'Backlogs';
                      formattedValue = dataService.formatCurrency(value);
                    } else if (name === 'completionPercentage') {
                      label = 'Completion Rate';
                      formattedValue = `${value.toFixed(1)}%`;
                    } else {
                      label = name;
                      formattedValue = dataService.formatCurrency(value);
                    }
                    return [formattedValue, label];
                  }}
                  labelFormatter={(label) => {
                    if (typeof label === 'string') {
                      return `Year ${label}`;
                    }
                    return `Year ${String(label)}`;
                  }}
                />
                <Legend iconSize={8} />
                <Bar 
                  yAxisId="left"
                  dataKey="totalContractAmount" 
                  fill="url(#contractGradient)" 
                  name="Contract Amount"
                  radius={[3, 3, 0, 0]}
                />
                <Bar 
                  yAxisId="left"
                  dataKey="totalBacklogs" 
                  fill="url(#billedGradient)" 
                  name="Backlogs"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="completionPercentage"
                  stroke={NET_PACIFIC_COLORS.warning}
                  strokeWidth={3}
                  dot={{ fill: NET_PACIFIC_COLORS.warning, strokeWidth: 2, r: 4 }}
                  name="Completion Trend (%)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ 
            p: 2, 
            borderRadius: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0'
          }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#2c5aa0' }}>
              Project Distribution by Status
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusDistribution.map((item, index) => ({
                    ...item,
                    fill: [
                      NET_PACIFIC_COLORS.primary,
                      NET_PACIFIC_COLORS.success,
                      NET_PACIFIC_COLORS.warning,
                      NET_PACIFIC_COLORS.info,
                      NET_PACIFIC_COLORS.error,
                      NET_PACIFIC_COLORS.accent1,
                      NET_PACIFIC_COLORS.accent2
                    ][index % 7]
                  }))}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => {
                    const percent = entry.percent || 0;
                    const status = entry.name || '';
                    const count = entry.value || 0;
                    return percent > 5 ? `${status}\n${count} projects` : '';
                  }}
                  outerRadius={80}
                  dataKey="value"
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [`${value} projects`, '']}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={24}
                  iconType="circle"
                  wrapperStyle={{
                    paddingTop: '10px',
                    fontSize: '11px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>
      
      {/* Filters */}
      <Paper sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              label="Search"
              value={filters.searchTerm || ''}
              onChange={handleSearchChange}
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status || ''}
                onChange={handleFilterChange('status')}
                label="Status"
              >
                <MenuItem value="">All</MenuItem>
                {uniqueStatuses.map(status => (
                  <MenuItem key={status} value={status}>{status}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Year</InputLabel>
              <Select
                value={filters.year?.toString() || ''}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  year: e.target.value ? parseInt(e.target.value) : undefined
                }))}
                label="Year"
              >
                <MenuItem value="">All Years</MenuItem>
                {uniqueYears.map(year => (
                  <MenuItem key={year} value={year.toString()}>{year}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>
      
      {/* Projects Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2, flexGrow: 1 }}>
        <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e0e0' }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
            Projects ({filteredProjects.length})
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={importFromFile}
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
            />
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAddProjectDialogOpen(true)}
              sx={{ 
                backgroundColor: NET_PACIFIC_COLORS.primary,
                '&:hover': {
                  backgroundColor: NET_PACIFIC_COLORS.secondary
                }
              }}
            >
              Add Project
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<UploadIcon />}
              onClick={handleImportClick}
              sx={{ 
                borderColor: NET_PACIFIC_COLORS.primary, 
                color: NET_PACIFIC_COLORS.primary,
                '&:hover': {
                  borderColor: NET_PACIFIC_COLORS.secondary,
                  backgroundColor: 'rgba(44, 90, 160, 0.04)'
                }
              }}
            >
              Import
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<DownloadIcon />}
              endIcon={<ArrowDownIcon />}
              onClick={(e) => setExportMenuAnchor(e.currentTarget)}
              sx={{ backgroundColor: NET_PACIFIC_COLORS.primary }}
            >
              Export
            </Button>
            <Menu
              anchorEl={exportMenuAnchor}
              open={Boolean(exportMenuAnchor)}
              onClose={() => setExportMenuAnchor(null)}
              PaperProps={{
                sx: {
                  mt: 1,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                  borderRadius: 2
                }
              }}
            >
              <MenuItem onClick={() => { exportToCSV(); setExportMenuAnchor(null); }}>
                <ListItemIcon>
                  <CsvIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Export as CSV" />
              </MenuItem>
              <MenuItem onClick={() => { exportToExcel(); setExportMenuAnchor(null); }}>
                <ListItemIcon>
                  <ExcelIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Export as Excel" />
              </MenuItem>
            </Menu>
          </Box>
        </Box>
        
        {/* Bulk Actions */}
        {showBulkActions && (
          <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid #e0e0e0' }}>
            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
              <Typography variant="body2" color="textSecondary">
                {selectedProjects.size} project(s) selected
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setSelectedProjects(new Set());
                    setShowBulkActions(false);
                  }}
                >
                  Clear Selection
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleDeleteConfirmation}
                  sx={{
                    backgroundColor: '#d32f2f',
                    '&:hover': {
                      backgroundColor: '#b71c1c'
                    }
                  }}
                >
                  Delete Selected ({selectedProjects.size})
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}
        
        <TableContainer sx={{ maxHeight: 'calc(100vh - 480px)', minHeight: 300 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    indeterminate={selectedProjects.size > 0 && selectedProjects.size < filteredProjects.length}
                    checked={selectedProjects.size === filteredProjects.length && filteredProjects.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('project_no')}>Project No.{getSortIcon('project_no')}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('project_name')}>Project Name{getSortIcon('project_name')}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('account_name')}>Client{getSortIcon('account_name')}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('po_number')}>PO Number{getSortIcon('po_number')}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('po_date')}>PO Date{getSortIcon('po_date')}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('client_approver')}>Client Approver{getSortIcon('client_approver')}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('year')}>Year{getSortIcon('year')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('contract_amount')}>Contract Amount{getSortIcon('contract_amount')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('backlogs')}>Backlogs{getSortIcon('backlogs')}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('actual_site_progress_percent')}>Status{getSortIcon('actual_site_progress_percent')}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Project Health</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProjects.map((project) => (
                <TableRow key={project.id} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'rgba(0, 0, 0, 0.02)' } }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selectedProjects.has(project.id)}
                      onChange={(e) => handleProjectSelection(project.id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {project.project_no || (project.item_no ?? project.id)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                      {project.project_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {project.account_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {project.po_number || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {project.po_date ? dataService.formatDate(project.po_date) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {project.client_approver || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {project.year ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                      {dataService.formatCurrency(project.updated_contract_amount || 0)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                      {dataService.formatCurrency(dataService.getUnbilled(project))}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${project.actual_site_progress_percent ?? 0}%`}
                      size="small"
                      sx={{
                        backgroundColor: dataService.getStatusColor(project.project_status || ''),
                        color: 'white',
                        fontSize: '0.7rem',
                        height: 20
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {projectHealthMap[project.id] && (
                      <Box
                        sx={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          bgcolor: projectHealthMap[project.id].color === 'default' ? 'grey.400' : `${projectHealthMap[project.id].color}.main`,
                        }}
                        title={projectHealthMap[project.id].label}
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <IconButton 
                      size="small" 
                      onClick={() => onProjectSelect(project)}
                      title="View Project Details"
                    >
                      <VisibilityIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        PaperProps={{
          sx: {
            borderRadius: 3,
            minWidth: 400
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1, 
          color: '#d32f2f',
          pb: 1
        }}>
          <WarningIcon />
          Confirm Project Deletion
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. All project data will be permanently deleted.
          </Alert>
          <DialogContentText>
            Are you sure you want to delete <strong>{selectedProjects.size}</strong> selected project(s)?
          </DialogContentText>
          {selectedProjects.size <= 5 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Projects to be deleted:
              </Typography>
              <Box sx={{ pl: 2 }}>
                {filteredProjects
                  .filter(p => selectedProjects.has(p.id))
                  .map(project => (
                    <Typography key={project.id} variant="body2" sx={{ mb: 0.5 }}>
                      • {project.project_no || (project.item_no ?? project.id)} – {project.project_name}
                    </Typography>
                  ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button 
            onClick={handleDeleteCancel}
            variant="outlined"
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleBulkDelete}
            variant="contained" 
            color="error"
            disabled={isDeleting}
            startIcon={isDeleting ? null : <DeleteIcon />}
            sx={{
              backgroundColor: '#d32f2f',
              '&:hover': {
                backgroundColor: '#b71c1b'
              }
            }}
          >
            {isDeleting ? 'Deleting...' : `Delete ${selectedProjects.size} Project(s)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Project Dialog */}
      <AddProjectDialog
        open={addProjectDialogOpen}
        onClose={() => setAddProjectDialogOpen(false)}
        onProjectAdded={handleProjectAdded}
      />
    </Box>
  );
};

export default Dashboard;
