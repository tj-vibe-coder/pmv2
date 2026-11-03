import type { User } from '../types/User';

type AccessUser = Pick<User, 'role' | 'project_monitoring'> | null | undefined;

/** Staff accounts ('user' / 'viewer') work in the Employee Portal. */
export const isStaffRole = (user: AccessUser) => user?.role === 'user' || user?.role === 'viewer';

/**
 * Staff reach Project Monitoring (the project list and project pages) only when
 * a superadmin ticks "Project Monitoring" for them in User Management.
 */
export const canOpenProjectMonitoring = (user: AccessUser) =>
  !!user && (!isStaffRole(user) || !!user.project_monitoring);
