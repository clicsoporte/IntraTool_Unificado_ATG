const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'dbs', 'clic_tools.db');
const db = new Database(dbPath);

try {
    console.log("=== Checking notification_scheduled_tasks ===");
    const tasks = db.prepare(`SELECT * FROM notification_scheduled_tasks`).all();
    console.log(JSON.stringify(tasks, null, 2));
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
