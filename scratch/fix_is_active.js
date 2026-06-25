const Database = require('better-sqlite3');
const path = require('path');

console.log("=== FIXING core_users is_active DATA TYPES ===");

// Open the database
const dbPath = path.join(__dirname, '../dbs/clic_tools.db');
const db = new Database(dbPath);

// Update values to integer
const result = db.prepare(`
    UPDATE core_users 
    SET is_active = CASE 
        WHEN is_active LIKE '1%' THEN 1
        WHEN is_active LIKE '0%' THEN 0
        ELSE is_active 
    END
    WHERE is_active IS NOT NULL
`).run();

console.log(`Updated ${result.changes} rows.`);

// Let's verify the types now
const rows = db.prepare("SELECT id, name, is_active FROM core_users").all();
rows.forEach(row => {
    console.log(`User ID: ${row.id} -> name: "${row.name}" -> is_active: ${row.is_active} (${typeof row.is_active})`);
});
