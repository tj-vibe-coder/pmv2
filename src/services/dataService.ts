import { Project, BillingStatus, ProjectFilters, ProjectSummary, YearSummary } from '../types/Project';

const API_BASE_URL = '/api';

class DataService {

  // Helper function to convert Unix timestamp to Date
  private unixToDate(timestamp: number | null): Date | null {
    if (!timestamp) return null;
    return new Date(timestamp * 1000);
  }

  // Helper function to format currency
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  // Helper function to format dates
  formatDate(timestamp: number | null): string {
    if (!timestamp) return '';
    
    // Handle both seconds and milliseconds timestamps
    // If timestamp is 10 digits or less, it's in seconds, otherwise milliseconds
    const milliseconds = timestamp.toString().length <= 10 ? timestamp * 1000 : timestamp;
    
    return new Date(milliseconds).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // Get projects with filtering from API
  async getProjects(filters?: ProjectFilters): Promise<Project[]> {
    try {
      const params = new URLSearchParams();
      
      if (filters?.status) params.append('status', filters.status);
      if (filters?.client) params.append('client', filters.client);
      if (filters?.projectCategory) params.append('category', filters.projectCategory);
      if (filters?.year) params.append('year', filters.year.toString());
      if (filters?.searchTerm) params.append('search', filters.searchTerm);

      const queryString = params.toString();
      const url = `${API_BASE_URL}/projects${queryString ? `?${queryString}` : ''}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch projects');
      return await response.json();
    } catch (error) {
      console.error('Error fetching projects:', error);
      return [];
    }
  }

  async getProject(id: number): Promise<Project | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${id}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error fetching project:', error);
      return null;
    }
  }

  async updateProject(id: number, projectData: Partial<Project>): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { success: false, error: err.error || response.statusText };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Update failed' };
    }
  }

  // Get billing status records - return empty for now since we don't have this API
  getBillingStatus(): BillingStatus[] {
    return [];
  }

  /** Unbilled amount (backlogs) = contract value minus billed amount. */
  getUnbilled(project: Project): number {
    const contract = project.updated_contract_amount ?? project.contract_amount ?? 0;
    const billed = project.amount_contract_billed_net ?? project.contract_billed ?? 0;
    return Math.max(0, contract - billed);
  }

  // Helper function to get status color
  getStatusColor(status: string): string {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
      case 'CLOSED':
        return '#4caf50';
      case 'IN PROGRESS':
      case 'ONGOING':
      case 'OPEN':
        return '#2196f3';
      case 'NOT STARTED':
        return '#9e9e9e';
      case 'CANCELLED':
      case 'TERMINATED':
        return '#f44336';
      case 'SUSPENDED':
      case 'ON HOLD':
        return '#ff9800';
      default:
        return '#757575';
    }
  }

  // Get summary data for cards (calculate from projects)
  async getProjectSummary(): Promise<ProjectSummary> {
    try {
      const projects = await this.getProjects();
      
      return {
        totalContractAmount: this.getTotalContractValue(projects),
        totalBilledAmount: this.getTotalBilledAmount(projects),
        totalOutstandingBalance: this.getOutstandingBalance(projects),
        projectCount: projects.length
      };
    } catch (error) {
      console.error('Error calculating project summary:', error);
      return {
        totalContractAmount: 0,
        totalBilledAmount: 0,
        totalOutstandingBalance: 0,
        projectCount: 0
      };
    }
  }

  // Get year summaries (calculate from projects)
  async getYearSummaries(): Promise<YearSummary[]> {
    try {
      const projects = await this.getProjects();
      
      const yearData = projects.reduce((acc, project) => {
        const year = project.year || new Date().getFullYear();
        if (!acc[year]) {
          acc[year] = { 
            year, 
            projectCount: 0, 
            totalContractAmount: 0,
            totalBilledAmount: 0,
            totalOutstandingBalance: 0
          };
        }
        acc[year].projectCount++;
        acc[year].totalContractAmount += project.updated_contract_amount || project.contract_amount || 0;
        acc[year].totalBilledAmount += project.amount_contract_billed_net || 0;
        acc[year].totalOutstandingBalance += (project.updated_contract_amount || project.contract_amount || 0) - (project.amount_contract_billed_net || 0);
        return acc;
      }, {} as Record<number, YearSummary>);

      return Object.values(yearData)
        .sort((a, b) => b.year - a.year);
    } catch (error) {
      console.error('Error calculating year summaries:', error);
      return [];
    }
  }

  // Get unique values for filter dropdowns
  async getUniqueClients(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/unique/clients`);
      if (!response.ok) throw new Error('Failed to fetch clients');
      return await response.json();
    } catch (error) {
      console.error('Error fetching unique clients:', error);
      return [];
    }
  }

  async getUniqueCategories(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/unique/categories`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      return await response.json();
    } catch (error) {
      console.error('Error fetching unique categories:', error);
      return [];
    }
  }

  async getUniqueStatuses(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/unique/statuses`);
      if (!response.ok) throw new Error('Failed to fetch statuses');
      return await response.json();
    } catch (error) {
      console.error('Error fetching unique statuses:', error);
      return [];
    }
  }

  async getUniqueYears(): Promise<number[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/unique/years`);
      if (!response.ok) throw new Error('Failed to fetch years');
      return await response.json();
    } catch (error) {
      console.error('Error fetching unique years:', error);
      return [];
    }
  }

  // Helper functions for status calculations
  getOpenProjects(projects: Project[]): Project[] {
    return projects.filter(p => 
      ['OPEN', 'IN PROGRESS', 'ONGOING'].includes(p.project_status?.toUpperCase() || '')
    );
  }

  getCompletedProjects(projects: Project[]): Project[] {
    return projects.filter(p => 
      ['COMPLETED', 'CLOSED'].includes(p.project_status?.toUpperCase() || '')
    );
  }

  getTotalContractValue(projects: Project[]): number {
    return projects.reduce((total, project) => {
      return total + (project.updated_contract_amount || project.contract_amount || 0);
    }, 0);
  }

  getTotalBilledAmount(projects: Project[]): number {
    return projects.reduce((total, project) => {
      return total + (project.amount_contract_billed_net || 0);
    }, 0);
  }

  getOutstandingBalance(projects: Project[]): number {
    return this.getTotalContractValue(projects) - this.getTotalBilledAmount(projects);
  }

  // Additional methods needed by components
  async addProject(projectData: Partial<Project>): Promise<{success: boolean; errors: string[]; id?: number}> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(projectData)
      });
      
      if (!response.ok) {
        const error = await response.text();
        return { success: false, errors: [error] };
      }
      
      const result = await response.json();
      return { success: true, errors: [], id: result.id };
    } catch (error) {
      return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] };
    }
  }

  async addProjects(projects: Partial<Project>[]): Promise<{success: boolean; errors: string[]; count?: number}> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projects })
      });
      
      if (!response.ok) {
        const error = await response.text();
        return { success: false, errors: [error] };
      }
      
      const result = await response.json();
      // server returns { success, addedCount, errors }
      return { success: true, errors: result.errors || [], count: result.addedCount };
    } catch (error) {
      return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] };
    }
  }

  async deleteProjects(projectIds: number[]): Promise<{success: boolean; errors: string[]}> {
    try {
      // server expects DELETE /api/projects with body: { ids: number[] }
      const response = await fetch(`${API_BASE_URL}/projects`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: projectIds })
      });
      
      if (!response.ok) {
        const error = await response.text();
        return { success: false, errors: [error] };
      }
      
      return { success: true, errors: [] };
    } catch (error) {
      return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] };
    }
  }

  async getProjectCount(): Promise<number> {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/count`);
      if (!response.ok) throw new Error('Failed to get project count');
      const result = await response.json();
      return result.count || 0;
    } catch (error) {
      console.error('Error getting project count:', error);
      return 0;
    }
  }

  async getStatusDistribution(): Promise<{label: string; value: number; color: string}[]> {
    try {
      const projects = await this.getProjects();
      const statusCounts = projects.reduce((acc, project) => {
        const status = project.project_status || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return Object.entries(statusCounts)
        .map(([status, count]) => ({
          label: status,
          value: count,
          color: this.getStatusColor(status)
        }))
        .sort((a, b) => b.value - a.value);
    } catch (error) {
      console.error('Error getting status distribution:', error);
      return [];
    }
  }

  getProjectHealthColor(project: Project): string {
    if (!project.project_status) return '#757575';
    
    const status = project.project_status.toUpperCase();
    const progress = project.actual_site_progress_percent || 0;
    
    if (status === 'COMPLETED' || status === 'CLOSED') return '#4caf50';
    if (status === 'CANCELLED' || status === 'TERMINATED') return '#f44336';
    if (progress > 80) return '#4caf50';
    if (progress > 50) return '#2196f3';
    if (progress > 20) return '#ff9800';
    return '#f44336';
  }
}

// Export singleton instance
const dataServiceInstance = new DataService();
export default dataServiceInstance;