
/**
 * @fileoverview Service for securely connecting to and querying an MSSQL database.
 * This file handles the connection pooling and ensures that only read-only
 * SELECT queries can be executed, providing a safeguard against accidental data
 * modification or malicious attacks.
 */
'use server';

import sql from 'mssql';
import { logError } from '@/modules/core/lib/logger';
import { getSqlConfig } from '@/modules/core/lib/config-db';

let pool: sql.ConnectionPool | null = null;
let isConnecting = false;
let connectionPromise: Promise<sql.ConnectionPool> | null = null;


/**
 * Retrieves and validates the database configuration.
 * @returns {Promise<sql.config>} A configuration object for the `mssql` library.
 * @throws {Error} If the configuration is incomplete.
 */
async function getDbConfig(): Promise<sql.config> {
    const dbConfig = await getSqlConfig();

    if (!dbConfig || !dbConfig.user || !dbConfig.host || !dbConfig.database) {
        throw new Error("Las credenciales de SQL Server no están configuradas. Por favor, verifica el usuario, servidor y base de datos en la pantalla de administración.");
    }
    
    return {
        user: dbConfig.user,
        password: dbConfig.password,
        server: dbConfig.host,
        database: dbConfig.database,
        port: Number(dbConfig.port) || 1433,
        options: {
            encrypt: dbConfig.host.toLowerCase().includes('azure') ? true : false, // Recommended for Azure
            trustServerCertificate: true, // For local development; set to false in production with a proper certificate
            connectTimeout: 30000,
            requestTimeout: 30000,
            enableArithAbort: true,
            useUTC: false // CRITICAL: This prevents the driver from converting dates to the server's local timezone.
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    };
}

/**
 * Strips both single-line (--) and multi-line (/* *\/) SQL comments from a query string.
 * This is used for validation purposes only.
 */
function stripSqlComments(query: string): string {
    // Replace multi-line comments /* ... */
    let cleaned = query.replace(/\/\*[\s\S]*?\*\//g, '');
    // Replace single-line comments -- ...
    cleaned = cleaned.replace(/--.*$/gm, '');
    return cleaned;
}

/**
 * Validates a SQL query string to ensure it is a read-only SELECT statement.
 * @param {string} query - The SQL query to validate.
 * @throws {Error} If the query is not a valid, read-only SELECT statement.
 */
function validateSelectOnly(query: string): void {
    const strippedQuery = stripSqlComments(query);
    const cleanedQuery = strippedQuery.trim().toLowerCase();
    
    const forbiddenKeywords = [
        'insert', 'update', 'delete', 'drop', 'alter', 'create', 
        'truncate', 'execute', 'exec', 'grant', 'revoke'
    ];
    
    if (!cleanedQuery.startsWith('select')) {
        throw new Error("Solo se permiten consultas SELECT.");
    }
    
    for (const keyword of forbiddenKeywords) {
        if (cleanedQuery.includes(` ${keyword} `) || cleanedQuery.includes(` ${keyword};`)) {
            throw new Error(`La consulta contiene la palabra prohibida: ${keyword}`);
        }
    }
    
    if ((cleanedQuery.match(/;/g) || []).length > 1) {
        throw new Error("La consulta contiene múltiples sentencias (statements).");
    }
}

/**
 * Gets a connection from the connection pool, creating the pool if it doesn't exist.
 * This function is designed to be robust, handling concurrent requests and reconnections.
 * @returns {Promise<sql.ConnectionPool>} A promise that resolves to the connection pool.
 */
async function getConnectionPool(): Promise<sql.ConnectionPool> {
    if (pool && pool.connected) {
        return pool;
    }

    if (isConnecting && connectionPromise) {
        return connectionPromise;
    }

    isConnecting = true;
    connectionPromise = (async () => {
        try {
            const config = await getDbConfig();
            
            console.log("Attempting to connect to SQL Server...");
            const newPool = new sql.ConnectionPool(config);
            
            newPool.on('error', err => {
                logError('Error en el pool de SQL Server', { error: err });
                pool = null; // Reset pool on error
            });

            await newPool.connect();
            console.log('✅ Conexión a SQL Server establecida.');
            pool = newPool;
            return pool;

        } catch (err: any) {
            pool = null;
            logError("Error al conectar con SQL Server", { error: { message: err.message, code: err.code }});
            throw new Error(`No se pudo establecer la conexión con la base de datos de SQL Server.`);
        } finally {
            isConnecting = false;
            connectionPromise = null;
        }
    })();

    return connectionPromise;
}

/**
 * Executes a read-only SQL query against the configured database.
 * @param {string} query - The SELECT query to execute.
 * @param {AbortSignal} [signal] - An optional AbortSignal to cancel the query.
 * @returns {Promise<any[]>} A promise that resolves to an array of records.
 * @throws {Error} If the query is invalid, is aborted, or if the database connection fails.
 */
export async function executeQuery(query: string, signal?: AbortSignal): Promise<any[]> {
    validateSelectOnly(query);
    
    let connection: sql.ConnectionPool;
    
    try {
        connection = await getConnectionPool();
        const request = connection.request();
        if (signal) {
            signal.addEventListener('abort', () => {
                request.cancel();
            });
            if (signal.aborted) {
                throw new Error("Query was aborted.");
            }
        }
        
        const result = await request.query(query);
        return result.recordset;
        
    } catch (err: any) {
        if (err.name === 'AbortError' || err.message.includes('Canceled')) {
            console.log(`Query was canceled: ${query.substring(0, 100)}...`);
            throw new Error("La consulta al ERP fue cancelada.");
        }

        logError("Error al ejecutar consulta SELECT", { 
            error: err.message,
            code: err.code,
            query: query.substring(0, 500)
        });
        
        if (err.code === 'ESOCKET' || err.code === 'ECONNCLOSED') {
            pool = null; // Reset pool for reconnection on next attempt
        }
        
        throw new Error(`Error en la consulta SQL: ${err.message}`);
    }
}
