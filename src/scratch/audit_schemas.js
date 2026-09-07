const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../dbs/clic_tools.db');
const db = new Database(dbPath);

console.log('=== AUDITORÍA DE ESQUEMA DE BASE DE DATOS ===');

// 1. Tablas existentes
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(t => t.name);
console.log(`\nTotal de Tablas encontradas: ${tables.length}`);

// 2. Comprobación de integridad
const integrity = db.prepare("PRAGMA integrity_check").all();
console.log('Pragma Integrity Check:', integrity);

// 3. Tablas críticas de ITAM / Agente
const itTables = ['it_assets', 'it_asset_assignments', 'it_asset_documents', 'it_asset_licenses', 'it_agent_telemetry', 'it_agent_commands', 'it_agent_ota_releases', 'ops_app_version_settings', 'fleet_registered_devices'];
console.log('\n--- Columnas de Tablas Críticas ---');

for (const t of itTables) {
    if (tables.includes(t)) {
        const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => `${c.name} (${c.type})`);
        console.log(`\n[OK] Tabla: ${t} (${cols.length} columnas):`);
        console.log('   ' + cols.join(', '));
    } else {
        console.log(`\n[FALTA] Tabla: ${t}`);
    }
}

// 4. Comprobación de ops_app_version_settings
console.log('\n--- ops_app_version_settings row ---');
const verRow = db.prepare("SELECT * FROM ops_app_version_settings WHERE id = 1").get();
console.log(verRow);

// 5. Total de registros en activos
const assetCount = db.prepare("SELECT count(*) as count FROM it_assets").get();
console.log('\nTotal de Activos TI en it_assets:', assetCount.count);
