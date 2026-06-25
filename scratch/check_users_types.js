const Database = require('better-sqlite3');
const path = require('path');

console.log("=== INSPECTING core_users SCHEMA & DATA TYPES ===");

// Open the database
const dbPath = path.join(__dirname, '../dbs/clic_tools.db');
const db = new Database(dbPath);

// Get table info
const tableInfo = db.prepare("PRAGMA table_info(core_users)").all();
console.log("\nTable Schema (PRAGMA):");
console.log(tableInfo.map(c => `${c.name}: ${c.type} (notnull: ${c.notnull})`).join('\n'));

// Get all users
const rows = db.prepare("SELECT * FROM core_users").all();
console.log(`\nFound ${rows.length} users in core_users:`);
rows.forEach(row => {
    console.log(`\nUser ID: ${row.id} (${typeof row.id})`);
    console.log(`- name: "${row.name}" (${typeof row.name})`);
    console.log(`- email: "${row.email}" (${typeof row.email})`);
    console.log(`- role: "${row.role}" (${typeof row.role})`);
    console.log(`- is_active: ${row.is_active} (${typeof row.is_active})`);
    console.log(`- forcePasswordChange: ${row.forcePasswordChange} (${typeof row.forcePasswordChange})`);
    console.log(`- employeeId: ${row.employeeId} (${typeof row.employeeId})`);
    console.log(`- salespersonId: ${row.salespersonId} (${typeof row.salespersonId})`);
});
