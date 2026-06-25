const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'dbs', 'clic_tools.db');
const db = new Database(dbPath);

console.log('--- AUDITORÍA DE CHOFERES Y USUARIOS ---');

// 1. Obtener drivers en fleet_settings
const fleetDrivers = db.prepare("SELECT * FROM fleet_settings WHERE category = 'driver'").all();
console.log('\n1. Choferes en fleet_settings (Gestión de Choferes):');
console.log(fleetDrivers);

// 2. Obtener usuarios en core_users con su employeeId
const coreUsers = db.prepare("SELECT id, name, employeeId, erpAlias, email FROM core_users").all();
console.log('\n2. Usuarios en core_users (con employeeId):');
console.log(coreUsers);

// 3. Cruzar directamente
const matched = db.prepare(`
    SELECT u.id, u.name, u.employeeId, fs.value as fleet_value
    FROM core_users u
    JOIN fleet_settings fs ON fs.category = 'driver' AND fs.value = u.employeeId
`).all();
console.log('\n3. Choferes que cruzan exactamente (JOIN exacto):');
console.log(matched);

// 4. Cruzar quitando ceros a la izquierda (por si acaso)
const matchedClean = db.prepare(`
    SELECT u.id, u.name, u.employeeId, fs.value as fleet_value
    FROM core_users u
    JOIN fleet_settings fs ON fs.category = 'driver' AND CAST(fs.value AS INT) = CAST(u.employeeId AS INT)
`).all();
console.log('\n4. Choferes cruzando quitando ceros (CAST AS INT):');
console.log(matchedClean);

db.close();
console.log('\n--- FIN DE AUDITORÍA ---');
