const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../dbs/clic_tools.db');
const db = new Database(dbPath);

console.log('=== AUDITORÍA DETALLADA DE ESQUEMAS IT_TOOLS ===');

const itToolsTables = [
    'it_notes',
    'it_settings',
    'it_branches',
    'it_assets',
    'it_asset_assignments',
    'it_licenses_catalog',
    'it_asset_licenses',
    'it_asset_components',
    'it_asset_documents',
    'it_asset_telemetry',
    'it_agent_commands',
    'it_asset_installed_software',
    'it_agent_ota_versions',
    '_it_migrations',
    'ops_app_version_settings',
    'fleet_registered_devices'
];

for (const t of itToolsTables) {
    const exists = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?").get(t).count > 0;
    if (exists) {
        const cols = db.prepare(`PRAGMA table_info(${t})`).all();
        const count = db.prepare(`SELECT count(*) as count FROM ${t}`).get().count;
        console.log(`\n✅ ${t} (Filas: ${count}, Columnas: ${cols.length})`);
        cols.forEach(c => console.log(`   - ${c.name}: ${c.type}${c.pk ? ' [PK]' : ''}${c.notnull ? ' [NOT NULL]' : ''}`));
    } else {
        console.log(`\n❌ [FALTA]: ${t}`);
    }
}

console.log('\n=== MIGRACIONES REGISTRADAS (_it_migrations) ===');
const migrations = db.prepare("SELECT * FROM _it_migrations ORDER BY version ASC").all();
console.table(migrations);
