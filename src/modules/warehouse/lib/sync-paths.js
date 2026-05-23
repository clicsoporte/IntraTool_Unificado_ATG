const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'dbs', 'clic_tools.db');
console.log('Using DB at:', dbPath);
const db = new Database(dbPath);

console.log('--- Syncing Location Paths ---');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables found:', tables.map(t => t.name).join(', '));

const locations = db.prepare('SELECT id, name FROM wh_locations').all();
console.log(`Processing ${locations.length} locations...`);

const updateStmt = db.prepare('UPDATE wh_locations SET cached_full_path = ? WHERE id = ?');

db.transaction(() => {
    for (const loc of locations) {
        let currentId = loc.id;
        const pathParts = [];
        while (currentId) {
            const row = db.prepare('SELECT name, parentId FROM wh_locations WHERE id = ?').get(currentId);
            if (!row) break;
            pathParts.unshift(row.name);
            currentId = row.parentId;
        }
        const fullPath = pathParts.join(' > ');
        updateStmt.run(fullPath, loc.id);
    }
})();

console.log('Done!');
db.close();
