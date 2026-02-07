// Count columns in table definition
const tableDefinition = `
    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_no INTEGER,
        year INTEGER,
        am TEXT,
        ovp_number TEXT,
        po_number TEXT,
        po_date INTEGER,
        client_status TEXT,
        account_name TEXT,
        project_name TEXT,
        project_category TEXT,
        project_location TEXT,
        scope_of_work TEXT,
        qtn_no TEXT,
        ovp_category TEXT,
        contract_amount REAL,
        updated_contract_amount REAL,
        down_payment_percent REAL,
        retention_percent REAL,
        start_date INTEGER,
        duration_days INTEGER,
        completion_date INTEGER,
        payment_schedule TEXT,
        payment_terms TEXT,
        bonds_requirement TEXT,
        project_director TEXT,
        client_approver TEXT,
        progress_billing_schedule TEXT,
        mobilization_date INTEGER,
        updated_completion_date INTEGER,
        project_status TEXT,
        actual_site_progress_percent REAL,
        actual_progress REAL,
        evaluated_progress_percent REAL,
        evaluated_progress REAL,
        for_rfb_percent REAL,
        for_rfb_amount REAL,
        rfb_date INTEGER,
        type_of_rfb TEXT,
        work_in_progress_ap REAL,
        work_in_progress_ep REAL,
        updated_contract_balance_percent REAL,
        total_contract_balance REAL,
        updated_contract_balance_net_percent REAL,
        updated_contract_balance_net REAL,
        remarks TEXT,
        contract_billed_gross_percent REAL,
        contract_billed REAL,
        contract_billed_net_percent REAL,
        amount_contract_billed_net REAL,
        for_retention_billing_percent REAL,
        amount_for_retention_billing REAL,
        retention_status TEXT,
        unevaluated_progress REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`;

const insertColumns = [
    'item_no', 'year', 'am', 'ovp_number', 'po_number', 'po_date', 'client_status',
    'account_name', 'project_name', 'project_category', 'project_location',
    'scope_of_work', 'qtn_no', 'ovp_category', 'contract_amount', 'updated_contract_amount',
    'down_payment_percent', 'retention_percent', 'start_date', 'duration_days',
    'completion_date', 'payment_schedule', 'payment_terms', 'bonds_requirement',
    'project_director', 'client_approver', 'progress_billing_schedule',
    'mobilization_date', 'updated_completion_date', 'project_status',
    'actual_site_progress_percent', 'actual_progress', 'evaluated_progress_percent',
    'evaluated_progress', 'for_rfb_percent', 'for_rfb_amount', 'rfb_date',
    'type_of_rfb', 'work_in_progress_ap', 'work_in_progress_ep',
    'updated_contract_balance_percent', 'total_contract_balance',
    'updated_contract_balance_net_percent', 'updated_contract_balance_net',
    'remarks', 'contract_billed_gross_percent', 'contract_billed',
    'contract_billed_net_percent', 'amount_contract_billed_net',
    'for_retention_billing_percent', 'amount_for_retention_billing',
    'retention_status', 'unevaluated_progress'
];

console.log('INSERT columns count:', insertColumns.length);

const allColumns = tableDefinition.match(/\w+\s+(INTEGER|TEXT|REAL|DATETIME)/g) || [];
console.log('Table columns count (excluding auto columns):', allColumns.length);

console.log('\nINSERT columns:');
insertColumns.forEach((col, index) => console.log(`${index + 1}. ${col}`));

console.log('\nTable definition columns:');
allColumns.forEach((col, index) => console.log(`${index + 1}. ${col}`));