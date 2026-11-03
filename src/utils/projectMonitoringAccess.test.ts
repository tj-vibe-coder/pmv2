import { canOpenProjectMonitoring, isStaffRole } from './projectMonitoringAccess';

describe('projectMonitoringAccess', () => {
  it('lets admins in and keeps staff out unless ticked', () => {
    expect(canOpenProjectMonitoring({ role: 'superadmin' })).toBe(true);
    expect(canOpenProjectMonitoring({ role: 'admin' })).toBe(true);
    expect(canOpenProjectMonitoring({ role: 'user' })).toBe(false);
    expect(canOpenProjectMonitoring({ role: 'viewer', project_monitoring: false })).toBe(false);
    expect(canOpenProjectMonitoring({ role: 'user', project_monitoring: true })).toBe(true);
    expect(canOpenProjectMonitoring(null)).toBe(false);
  });

  it('treats user and viewer as staff', () => {
    expect(isStaffRole({ role: 'user' })).toBe(true);
    expect(isStaffRole({ role: 'viewer' })).toBe(true);
    expect(isStaffRole({ role: 'admin' })).toBe(false);
    expect(isStaffRole({ role: 'tax_filer' })).toBe(false);
  });
});
