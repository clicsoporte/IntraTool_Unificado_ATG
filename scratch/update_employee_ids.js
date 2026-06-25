const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'dbs', 'clic_tools.db');
const db = new Database(dbPath);

const users = db.prepare("SELECT id, name, employeeId FROM core_users").all();
const employees = db.prepare("SELECT EMPLEADO as id, NOMBRE as name FROM core_employees").all();

console.log(`Cargados ${users.length} usuarios y ${employees.length} empleados.`);

const normalize = (str) => {
    return str.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // quitar acentos
        .replace(/[^a-z0-9 ]/g, "")
        .trim();
};

const updateStmt = db.prepare("UPDATE core_users SET employeeId = ? WHERE id = ?");
let updateCount = 0;

db.transaction(() => {
    for (const user of users) {
        if (user.employeeId) {
            continue;
        }

        const uNorm = normalize(user.name);
        const uWords = uNorm.split(/\s+/).filter(w => w.length > 2); // palabras de más de 2 letras

        let bestMatch = null;
        let maxMatches = 0;

        for (const emp of employees) {
            const eNorm = normalize(emp.name);
            const eWords = eNorm.split(/\s+/);

            // Contar cuántas palabras del usuario están en el nombre del empleado
            let matchCount = 0;
            for (const w of uWords) {
                if (eWords.includes(w)) {
                    matchCount++;
                }
            }

            if (matchCount > maxMatches) {
                maxMatches = matchCount;
                bestMatch = emp;
            }
        }

        const threshold = Math.min(uWords.length, 2);
        if (bestMatch && maxMatches >= threshold) {
            // Omitimos nombres muy genéricos o coincidencias insuficientes
            if (user.name === 'Jonathan UG' && bestMatch.id !== '0053') continue; // Forzar a Jonathan Ugalde
            
            console.log(`Vinculando usuario "${user.name}" (ID ${user.id}) ➡️ Empleado "${bestMatch.name}" (Código ${bestMatch.id})`);
            updateStmt.run(bestMatch.id, user.id);
            updateCount++;
        }
    }
})();

db.close();
console.log(`\n✅ Proceso completado. Se vincularon ${updateCount} usuarios de forma automática.`);
