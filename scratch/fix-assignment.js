const Database = require('better-sqlite3');
const path = require('path');

console.log('--- COMPLETED DOCUMENTS COORDINATES ---');
try {
    const dbPath = path.join(process.cwd(), 'dbs', 'clic_tools.db');
    const db = new Database(dbPath);

    // Query 4 completed documents
    const completedDocs = db.prepare("SELECT id, documento_numero, cliente_nombre, estado, entregado, latitud, longitud FROM ops_delivery_queue WHERE asignacion_id = 21 AND entregado = 1").all();
    console.table(completedDocs);

} catch (err) {
    console.error('Error:', err);
}
