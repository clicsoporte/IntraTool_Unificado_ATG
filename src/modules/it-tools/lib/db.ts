/**
 * @fileoverview Server-side functions for the new IT Tools module database.
 * This file handles all direct interactions with the unified database.
 */
"use server";

import { getDb } from '@/modules/core/lib/db';
import type { ITNote } from '@/modules/core/types';
import { IT_TOOLS_TABLES } from './schema';
import { authorizeAction } from '@/modules/core/lib/auth-guard';

// Unified DB configuration

export async function getNotes(): Promise<ITNote[]> {
    const db = await getDb();
    const notes = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.notes} ORDER BY updatedAt DESC`).all() as ITNote[];
    return JSON.parse(JSON.stringify(notes));
}

export async function saveNote(note: Omit<ITNote, 'id' | 'createdAt' | 'updatedAt'> & { id?: number }): Promise<ITNote> {
    await authorizeAction(note.id ? 'it-tools:notes:update' : 'it-tools:notes:create');
    const db = await getDb();
    const now = new Date().toISOString();

    if (note.id) { // Update
        db.prepare(
            `UPDATE ${IT_TOOLS_TABLES.notes} SET title = ?, content = ?, linkedModule = ?, updatedAt = ? WHERE id = ?`
        ).run(note.title, note.content, note.linkedModule || null, now, note.id);
        const updatedNote = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.notes} WHERE id = ?`).get(note.id) as ITNote;
        return updatedNote;
    } else { // Create
        const info = db.prepare(
            `INSERT INTO ${IT_TOOLS_TABLES.notes} (title, content, linkedModule, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(note.title, note.content, note.linkedModule || null, note.createdBy, now, now);
        const newNote = db.prepare(`SELECT * FROM ${IT_TOOLS_TABLES.notes} WHERE id = ?`).get(info.lastInsertRowid) as ITNote;
        return newNote;
    }
}

export async function deleteNote(id: number): Promise<void> {
    await authorizeAction('it-tools:notes:delete');
    const db = await getDb();
    db.prepare(`DELETE FROM ${IT_TOOLS_TABLES.notes} WHERE id = ?`).run(id);
}
