#!/usr/bin/env node
/**
 * Migrate data from local projects.db to SQLite Cloud.
 * Requires DATABASE_URL in .env pointing to your SQLite Cloud database.
 * Run: node scripts/migrate-local-to-cloud.js
 */
require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Database: SQLiteCloudDB } = require('@sqlitecloud/drivers');

const LOCAL_DB_PATH = path.join(__dirname, '..', 'projects.db');
const CLOUD_URL = process.env.DATABASE_URL;

if (!CLOUD_URL || !CLOUD_URL.startsWith('sqlitecloud://')) {
  console.error('Set DATABASE_URL in .env to your SQLite Cloud URL (sqlitecloud://...?apikey=...)');
  process.exit(1);
}

const TABLE_ORDER = [
  'projects',
  'users',
  'clients',
  'project_attachments',
  'suppliers',
  'supplier_products',
];

function runCloud(cloudDb, sql, params = []) {
  return new Promise((resolve, reject) => {
    if (params.length === 0) {
      cloudDb.run(sql, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    } else {
      cloudDb.run(sql, params, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    }
  });
}

function allLocal(localDb, sql, params = []) {
  return new Promise((resolve, reject) => {
    localDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function copyTable(localDb, cloudDb, tableName) {
  return allLocal(localDb, `SELECT * FROM ${tableName}`).then(async (rows) => {
    if (rows.length === 0) {
      console.log(`  ${tableName}: 0 rows (skip)`);
      return 0;
    }
    // Migrated users get approved=1 so they can still log in
    if (tableName === 'users') {
      rows = rows.map((r) => ({ ...r, approved: r.approved !== undefined ? r.approved : 1 }));
    }
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const colList = columns.join(', ');
    const insertSql = `INSERT OR REPLACE INTO ${tableName} (${colList}) VALUES (${placeholders})`;
    let count = 0;
    for (const row of rows) {
      const values = columns.map((c) => row[c]);
      await runCloud(cloudDb, insertSql, values);
      count++;
    }
    console.log(`  ${tableName}: ${count} rows`);
    return count;
  });
}

function ensureCloudSchema(cloudDb) {
  const run = (sql) => runCloud(cloudDb, sql);
  return run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_no TEXT,
      item_no INTEGER,
      year INTEGER,
      am TEXT,
      ovp_number TEXT,
      po_number TEXT,
      po_date INTEGER,
      client_status TEXT,
      account_name TEXT,
      project_name TEXT NOT NULL,
      project_category TEXT,
      project_location TEXT,
      scope_of_work TEXT,
      qtn_no TEXT,
      ovp_category TEXT,
      contract_amount REAL DEFAULT 0,
      updated_contract_amount REAL DEFAULT 0,
      down_payment_percent REAL DEFAULT 0,
      retention_percent REAL DEFAULT 0,
      start_date INTEGER,
      duration_days INTEGER DEFAULT 0,
      completion_date INTEGER,
      payment_schedule TEXT,
      payment_terms TEXT,
      bonds_requirement TEXT,
      project_director TEXT,
      client_approver TEXT,
      progress_billing_schedule TEXT,
      mobilization_date INTEGER,
      updated_completion_date INTEGER,
      project_status TEXT DEFAULT 'OPEN',
      actual_site_progress_percent REAL DEFAULT 0,
      actual_progress REAL DEFAULT 0,
      evaluated_progress_percent REAL DEFAULT 0,
      evaluated_progress REAL DEFAULT 0,
      for_rfb_percent REAL DEFAULT 0,
      for_rfb_amount REAL DEFAULT 0,
      rfb_date INTEGER,
      type_of_rfb TEXT,
      work_in_progress_ap REAL DEFAULT 0,
      work_in_progress_ep REAL DEFAULT 0,
      updated_contract_balance_percent REAL DEFAULT 0,
      total_contract_balance REAL DEFAULT 0,
      updated_contract_balance_net_percent REAL DEFAULT 0,
      updated_contract_balance_net REAL DEFAULT 0,
      remarks TEXT,
      contract_billed_gross_percent REAL DEFAULT 0,
      contract_billed REAL DEFAULT 0,
      contract_billed_net_percent REAL DEFAULT 0,
      amount_contract_billed_net REAL DEFAULT 0,
      for_retention_billing_percent REAL DEFAULT 0,
      amount_for_retention_billing REAL DEFAULT 0,
      retention_status TEXT,
      unevaluated_progress REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
    .then(() =>
      run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      approved INTEGER DEFAULT 1,
      full_name TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `)
    )
    .then(() =>
      run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      address TEXT,
      payment_terms TEXT,
      contact_person TEXT,
      designation TEXT,
      email_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
    )
    .then(() =>
      run(`
    CREATE TABLE IF NOT EXISTS project_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      onedrive_item_id TEXT NOT NULL,
      onedrive_web_url TEXT,
      file_size INTEGER,
      uploaded_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `)
    )
    .then(() =>
      run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      payment_terms TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
    )
    .then(() =>
      run(`
    CREATE TABLE IF NOT EXISTS supplier_products (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      name TEXT,
      part_no TEXT,
      description TEXT,
      brand TEXT,
      unit TEXT DEFAULT 'pcs',
      unit_price REAL,
      price_date TEXT,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `)
    );
}

function main() {
  return new Promise((resolve, reject) => {
    const localDb = new sqlite3.Database(LOCAL_DB_PATH, (err) => {
      if (err) {
        console.error('Failed to open local DB:', LOCAL_DB_PATH, err.message);
        reject(err);
        return;
      }
      console.log('Local DB opened:', LOCAL_DB_PATH);
    });

    const cloudDb = new SQLiteCloudDB(CLOUD_URL, async (err) => {
      if (err) {
        console.error('Failed to connect to SQLite Cloud:', err.message);
        localDb.close();
        reject(err);
        return;
      }
      console.log('Connected to SQLite Cloud');

      try {
        await ensureCloudSchema(cloudDb);
        console.log('Cloud schema ready');

        for (const table of TABLE_ORDER) {
          try {
            await copyTable(localDb, cloudDb, table);
          } catch (e) {
            if (e.message && e.message.includes('no such table')) {
              console.log(`  ${table}: (table missing locally, skip)`);
            } else {
              throw e;
            }
          }
        }

        console.log('Migration done.');
        localDb.close();
        cloudDb.close(() => resolve());
      } catch (e) {
        console.error('Migration error:', e);
        localDb.close();
        cloudDb.close(() => reject(e));
      }
    });
  });
}

main().catch(() => process.exit(1));
