const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.cwd(), 'clic_tools.db');
const db = new Database(dbPath);

try {
    console.log("--- Database path:", dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("Tables in this DB:", tables.map(t => t.name));
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
