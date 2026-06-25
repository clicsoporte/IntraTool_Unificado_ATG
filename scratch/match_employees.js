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

const matches = [];

for (const user of users) {
    if (user.employeeId) {
        console.log(`User "${user.name}" ya tiene employeeId: ${user.employeeId}`);
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

    // Si coinciden al menos 2 palabras (o 1 si el nombre del usuario solo tiene 1 palabra significativa)
    const threshold = Math.min(uWords.length, 2);
    if (bestMatch && maxMatches >= threshold) {
        matches.push({
            userId: user.id,
            userName: user.name,
            empId: bestMatch.id,
            empName: bestMatch.name,
            score: `${maxMatches}/${uWords.length}`
        });
    } else {
        console.log(`No se encontró coincidencia para el usuario: "${user.name}"`);
    }
}

console.log('\n--- RESULTADOS DEL MATCHING ---');
console.log(matches);

// Preguntar si queremos aplicar la actualización
// Para este script de prueba solo mostramos el resultado.
db.close();
