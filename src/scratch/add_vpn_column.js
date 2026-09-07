const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../dbs/clic_tools.db');
const db = new Database(dbPath);

const cols = db.prepare("PRAGMA table_info('fleet_registered_devices')").all().map(c => c.name);
if (!cols.includes('mdm_always_on_vpn')) {
    db.exec("ALTER TABLE fleet_registered_devices ADD COLUMN mdm_always_on_vpn INTEGER DEFAULT 0;");
    console.log("Columna 'mdm_always_on_vpn' agregada con éxito.");
} else {
    console.log("Columna 'mdm_always_on_vpn' ya existe en 'fleet_registered_devices'.");
}
