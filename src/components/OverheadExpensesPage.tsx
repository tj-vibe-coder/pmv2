import React from 'react';
import { Navigate } from 'react-router-dom';

// Overhead expenses are now managed in the unified Expense Monitoring table
// (ExpenseMonitoring.tsx) — one table over both `project_expenses` and
// `overhead_expenses`, filtered by scope. This route stays alive purely as a
// redirect for old bookmarks/links (same pattern as CalcsheetClients →
// /sales/clients); `?scope=overhead` presets the filter to overhead rows.
const OverheadExpensesPage: React.FC = () => (
  <Navigate to="/finance/expense-monitoring?scope=overhead" replace />
);

export default OverheadExpensesPage;
