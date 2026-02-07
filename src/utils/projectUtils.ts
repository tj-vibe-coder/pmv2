import { Project, ProjectSummary, ProjectDirectorSummary, YearSummary, ProjectFilters } from '../types/Project';

export const calculateProjectSummary = (projects: Project[]): ProjectSummary => {
  return projects.reduce(
    (summary, project) => ({
      totalContractAmount: summary.totalContractAmount + project.contract_amount,
      totalBilledAmount: summary.totalBilledAmount + project.contract_billed,
      totalOutstandingBalance: summary.totalOutstandingBalance + project.updated_contract_balance_net,
      projectCount: summary.projectCount + 1,
    }),
    {
      totalContractAmount: 0,
      totalBilledAmount: 0,
      totalOutstandingBalance: 0,
      projectCount: 0,
    }
  );
};

export const calculateDirectorSummaries = (projects: Project[]): ProjectDirectorSummary[] => {
  const directorMap = new Map<string, ProjectDirectorSummary>();
  
  projects.forEach(project => {
    const director = project.project_director;
    if (!directorMap.has(director)) {
      directorMap.set(director, {
        directorName: director,
        projectCount: 0,
        totalContractAmount: 0,
        totalBilledAmount: 0,
        totalOutstandingBalance: 0,
      });
    }
    
    const summary = directorMap.get(director)!;
    summary.projectCount += 1;
    summary.totalContractAmount += project.contract_amount;
    summary.totalBilledAmount += project.contract_billed;
    summary.totalOutstandingBalance += project.updated_contract_balance_net;
  });
  
  return Array.from(directorMap.values()).sort((a, b) => 
    b.totalContractAmount - a.totalContractAmount
  );
};

export const calculateYearSummaries = (projects: Project[]): YearSummary[] => {
  const yearMap = new Map<number, YearSummary>();
  
  projects.forEach(project => {
    const year = new Date(project.created_at).getFullYear();
    if (!yearMap.has(year)) {
      yearMap.set(year, {
        year,
        projectCount: 0,
        totalContractAmount: 0,
        totalBilledAmount: 0,
        totalOutstandingBalance: 0,
      });
    }
    
    const summary = yearMap.get(year)!;
    summary.projectCount += 1;
    summary.totalContractAmount += project.contract_amount;
    summary.totalBilledAmount += project.contract_billed;
    summary.totalOutstandingBalance += project.updated_contract_balance_net;
  });
  
  return Array.from(yearMap.values()).sort((a, b) => b.year - a.year);
};

export const filterProjects = (projects: Project[], filters: ProjectFilters): Project[] => {
  return projects.filter(project => {
    if (filters.year && new Date(project.created_at).getFullYear() !== filters.year) {
      return false;
    }
    
    if (filters.status && project.project_status !== filters.status) {
      return false;
    }
    
    if (filters.client && project.account_name !== filters.client) {
      return false;
    }
    

    
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      return (
        project.project_name.toLowerCase().includes(searchLower) ||
        project.account_name.toLowerCase().includes(searchLower) ||
        project.ovp_number.toLowerCase().includes(searchLower) ||
        project.po_number.toLowerCase().includes(searchLower)
      );
    }
    
    return true;
  });
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'OPEN':
      return '#4caf50';
    case 'CLOSED':
      return '#9e9e9e';
    case 'FOR_CLOSEOUT':
      return '#ff9800';
    case 'PENDING':
      return '#f44336';
    default:
      return '#2196f3';
  }
};

export const getProjectHealthColor = (project: Project): string => {
  const billingPercentage = project.contract_billed / project.contract_amount;
  
  if (project.project_status === 'CLOSED') {
    return '#4caf50';
  }
  
  if (billingPercentage > 0.9) {
    return '#4caf50';
  } else if (billingPercentage > 0.7) {
    return '#ff9800';
  } else {
    return '#f44336';
  }
};