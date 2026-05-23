import { Database } from 'better-sqlite3';

export const COST_ASSISTANT_TABLES = {
    drafts: 'cost_drafts',
    settings: 'cost_settings'
} as const;

export async function initializeCostAssistantSchema(db: Database) {
    // Check current version
    db.exec(`
        CREATE TABLE IF NOT EXISTS _cost_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            installed_at TEXT NOT NULL
        )
    `);

    const row = db.prepare('SELECT MAX(version) as version FROM _cost_migrations').get() as { version: number | null };
    const currentVersion = row?.version || 0;

    if (currentVersion < 1) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${COST_ASSISTANT_TABLES.drafts} (
                id TEXT PRIMARY KEY,
                userId INTEGER NOT NULL,
                name TEXT NOT NULL,
                createdAt TEXT NOT NULL,
                data TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ${COST_ASSISTANT_TABLES.settings} (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        // Seed initial settings
        const seedSettings = [
            ['nextDraftNumber', '1'],
            ['draftPrefix', 'AC-']
        ];

        const insertSetting = db.prepare(`INSERT OR IGNORE INTO ${COST_ASSISTANT_TABLES.settings} (key, value) VALUES (?, ?)`);
        for (const [key, value] of seedSettings) {
            insertSetting.run(key, value);
        }

        db.prepare('INSERT INTO _cost_migrations (version, installed_at) VALUES (?, ?)').run(1, new Date().toISOString());
    }

    console.log('Cost Assistant schema initialized at version', currentVersion < 1 ? 1 : currentVersion);
}
