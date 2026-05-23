import { Database } from 'better-sqlite3';

export const IT_TOOLS_TABLES = {
    notes: 'it_notes',
    settings: 'it_settings'
} as const;

export async function initializeItToolsSchema(db: Database) {
    // Check current version
    db.exec(`
        CREATE TABLE IF NOT EXISTS _it_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            installed_at TEXT NOT NULL
        )
    `);

    const row = db.prepare('SELECT MAX(version) as version FROM _it_migrations').get() as { version: number | null };
    const currentVersion = row?.version || 0;

    if (currentVersion < 1) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.notes} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT,
                tags TEXT,
                linkedModule TEXT,
                createdBy TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ${IT_TOOLS_TABLES.settings} (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        db.prepare('INSERT INTO _it_migrations (version, installed_at) VALUES (?, ?)').run(1, new Date().toISOString());
    }

    console.log('IT Tools schema initialized at version', currentVersion < 1 ? 1 : currentVersion);
}
