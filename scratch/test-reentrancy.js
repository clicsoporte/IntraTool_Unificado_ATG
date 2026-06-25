const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'dbs', 'clic_tools.db');
const db = new Database(dbPath);

const WAREHOUSE_TABLES = {
    locations: 'wh_locations'
};

function lockEntity(payload) {
    const { entityIds, userName, userId } = payload;
    const sessionId = String(userId);

    const transaction = db.transaction(() => {
        const placeholders = entityIds.map(() => '?').join(',');
        
        // Match our updated query
        const conflictingLocks = db.prepare(`
            SELECT id, lockedBy 
            FROM ${WAREHOUSE_TABLES.locations} 
            WHERE id IN (${placeholders}) 
              AND isLocked = 1 
              AND (lockedBySessionId != ? OR lockedBySessionId IS NULL)
        `).all(...entityIds, sessionId);
        
        if (conflictingLocks.length > 0) {
            const locker = conflictingLocks[0].lockedBy || 'otro usuario';
            const message = `Uno o más niveles ya están en uso por ${locker}.`;
            return { locked: true, message };
        }

        const stmt = db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET isLocked = 1, lockedBy = ?, lockedBySessionId = ? WHERE id IN (${placeholders})`);
        stmt.run(userName, sessionId, ...entityIds);
        
        return { locked: false, message: 'Bloqueo exitoso.' };
    });

    return transaction();
}

function releaseLock(entityIds, userId) {
    const placeholders = entityIds.map(() => '?').join(',');
    const sessionId = String(userId);
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET isLocked = 0, lockedBy = NULL, lockedBySessionId = NULL WHERE id IN (${placeholders}) AND lockedBySessionId = ?`).run(...entityIds, sessionId);
}

// Test Flow
try {
    const targetId = 4606;
    
    // Ensure it starts unlocked
    db.prepare(`UPDATE ${WAREHOUSE_TABLES.locations} SET isLocked = 0, lockedBy = NULL, lockedBySessionId = NULL WHERE id = ?`).run(targetId);
    console.log("Initial state cleared.");

    // 1. First lock by User 13 (Dagoberto)
    let res = lockEntity({ entityIds: [targetId], userName: "Dagoberto Serrano P", userId: 13 });
    console.log("1. Lock by Dagoberto (User 13):", res);
    
    // Check state in DB
    let loc = db.prepare(`SELECT isLocked, lockedBy, lockedBySessionId FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?`).get(targetId);
    console.log("DB State:", loc);

    // 2. Reentrant lock by User 13 (Dagoberto) - Should succeed (locked: false)
    res = lockEntity({ entityIds: [targetId], userName: "Dagoberto Serrano P", userId: 13 });
    console.log("2. Re-lock by Dagoberto (User 13):", res);

    // 3. Lock by User 14 (Other User) - Should fail (locked: true)
    res = lockEntity({ entityIds: [targetId], userName: "Otro Usuario", userId: 14 });
    console.log("3. Lock by User 14 (Other):", res);

    // 4. Release lock by User 13
    releaseLock([targetId], 13);
    console.log("4. Release lock by Dagoberto (User 13).");
    
    // Check state in DB
    loc = db.prepare(`SELECT isLocked, lockedBy, lockedBySessionId FROM ${WAREHOUSE_TABLES.locations} WHERE id = ?`).get(targetId);
    console.log("DB State after release:", loc);

} catch (e) {
    console.error(e);
} finally {
    db.close();
}
