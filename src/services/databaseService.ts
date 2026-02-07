import Database from 'better-sqlite3';
import path from 'path';
import { Project, ProjectDirector, BillingStatus, ProjectFilters, ProjectSummary } from '../types/Project';

class DatabaseService {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(process.cwd(), 'database', 'projects.db');
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
  }

  // Helper function to convert Unix timestamp to Date object
  private unixToDate(timestamp: number | null): Date | null {
    if (!timestamp) return null;
    return new Date(timestamp * 1000);
  }

  // Helper function to format dates for display
  private formatDate(timestamp: number | null): string {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  // Get all project directors
  getProjectDirectors(): ProjectDirector[] {
    const stmt = this.db.prepare('SELECT * FROM project_directors ORDER BY name');
    return stmt.all() as ProjectDirector[];
  }

  // Get projects with optional filtering
  getProjects(filters?: ProjectFilters, limit?: number, offset?: number): Project[] {
    let query = 'SELECT * FROM projects WHERE 1=1';
    const params: any[] = [];

    if (filters) {
      if (filters.year) {
        query += ' AND year = ?';
        params.push(filters.year);
      }
      if (filters.status) {
        query += ' AND project_status = ?';
        params.push(filters.status);
      }
      if (filters.client) {
        query += ' AND account_name LIKE ?';
        params.push(`%${filters.client}%`);
      }
      if (filters.projectCategory) {
        query += ' AND project_category = ?';
        params.push(filters.projectCategory);
      }
      if (filters.projectLocation) {
        query += ' AND project_location LIKE ?';
        params.push(`%${filters.projectLocation}%`);
      }
      if (filters.searchTerm) {
        query += ' AND (project_name LIKE ? OR account_name LIKE ? OR ovp_number LIKE ? OR scope_of_work LIKE ?)';
        const searchParam = `%${filters.searchTerm}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }
    }

    query += ' ORDER BY year DESC, id DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
      if (offset) {
        query += ' OFFSET ?';
        params.push(offset);
      }
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as Project[];
  }

  // Get projects by director (for department navigation)
  getProjectsByDirector(directorName: string, filters?: ProjectFilters, limit?: number): Project[] {
    // Filter projects by director name directly
    const allProjects = this.getProjects(filters, limit);
    return allProjects.filter(p => p.project_director === directorName);
  }

  // Get a single project by ID
  getProject(id: number): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(id) as Project | null;
  }

  // Get project summary statistics
  getProjectSummary(filters?: ProjectFilters): ProjectSummary {
    let query = `
      SELECT 
        COUNT(*) as projectCount,
        COALESCE(SUM(updated_contract_amount), 0) as totalContractAmount,
        COALESCE(SUM(contract_billed), 0) as totalBilledAmount,
        COALESCE(SUM(updated_contract_balance_net), 0) as totalOutstandingBalance
      FROM projects WHERE 1=1
    `;
    const params: any[] = [];

    if (filters) {
      if (filters.year) {
        query += ' AND year = ?';
        params.push(filters.year);
      }
      if (filters.status) {
        query += ' AND project_status = ?';
        params.push(filters.status);
      }
      // Add other filters as needed
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as any;
    
    return {
      projectCount: result.projectCount || 0,
      totalContractAmount: result.totalContractAmount || 0,
      totalBilledAmount: result.totalBilledAmount || 0,
      totalOutstandingBalance: result.totalOutstandingBalance || 0
    };
  }

  // Get year summaries for charts
  getYearSummaries(): any[] {
    const stmt = this.db.prepare(`
      SELECT 
        year,
        COUNT(*) as projectCount,
        COALESCE(SUM(updated_contract_amount), 0) as totalContractAmount,
        COALESCE(SUM(contract_billed), 0) as totalBilledAmount,
        COALESCE(SUM(updated_contract_balance_net), 0) as totalOutstandingBalance
      FROM projects
      WHERE year IS NOT NULL
      GROUP BY year
      ORDER BY year DESC
    `);
    return stmt.all();
  }

  // Get status distribution for pie chart
  getStatusDistribution(filters?: ProjectFilters): any[] {
    let query = `
      SELECT 
        project_status as name,
        COUNT(*) as value
      FROM projects WHERE project_status IS NOT NULL AND project_status != ''
    `;
    const params: any[] = [];


    if (filters?.year) {
      query += ' AND year = ?';
      params.push(filters.year);
    }

    query += ' GROUP BY project_status ORDER BY value DESC';

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  // Get director summaries
  getDirectorSummaries(): any[] {
    const stmt = this.db.prepare(`
      SELECT 
        project_director as directorName,
        COUNT(*) as projectCount,
        COALESCE(SUM(updated_contract_amount), 0) as totalContractAmount,
        COALESCE(SUM(contract_billed), 0) as totalBilledAmount,
        COALESCE(SUM(updated_contract_balance_net), 0) as totalOutstandingBalance
      FROM projects
      WHERE project_director IS NOT NULL AND project_director != ''
      GROUP BY project_director
      ORDER BY totalContractAmount DESC
    `);
    return stmt.all();
  }

  // Get unique values for filter dropdowns
  getUniqueClients(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT account_name 
      FROM projects 
      WHERE account_name IS NOT NULL AND account_name != '' 
      ORDER BY account_name
    `);
    return stmt.all().map((row: any) => row.account_name);
  }

  getUniqueProjectCategories(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT project_category 
      FROM projects 
      WHERE project_category IS NOT NULL AND project_category != '' 
      ORDER BY project_category
    `);
    return stmt.all().map((row: any) => row.project_category);
  }

  getUniqueProjectStatuses(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT project_status 
      FROM projects 
      WHERE project_status IS NOT NULL AND project_status != '' 
      ORDER BY project_status
    `);
    return stmt.all().map((row: any) => row.project_status);
  }

  getUniqueYears(): number[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT year 
      FROM projects 
      WHERE year IS NOT NULL 
      ORDER BY year DESC
    `);
    return stmt.all().map((row: any) => row.year);
  }

  // Get billing status records
  getBillingStatus(): BillingStatus[] {
    const stmt = this.db.prepare('SELECT * FROM billing_status ORDER BY year DESC');
    return stmt.all() as BillingStatus[];
  }

  // Close database connection
  close(): void {
    this.db.close();
  }

  // For development - get a sample of projects to understand the data structure
  getSampleProjects(limit: number = 5): Project[] {
    const stmt = this.db.prepare('SELECT * FROM projects LIMIT ?');
    return stmt.all(limit) as Project[];
  }
}

// Export a singleton instance
export const databaseService = new DatabaseService();
export default DatabaseService;