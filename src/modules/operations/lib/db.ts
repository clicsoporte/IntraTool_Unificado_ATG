/**
 * @fileoverview Server-side functions for the new Operations module database.
 * This file handles all direct interactions with the unified database.
 */
"use server";

import { getDb } from '@/modules/core/lib/db';
import type { OperationsDocumentType } from '@/modules/core/types';
import { OPERATIONS_TABLES } from './schema';

// Unified DB configuration

// Database initialization and migrations are now handled by the central orchestrator
// in core/lib/db.ts and operations/lib/schema.ts
