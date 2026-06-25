import { getDb } from '@/modules/core/lib/db';
import { FLEET_TABLES } from './schema';
import { logInfo, logError } from '@/modules/core/lib/logger';
import { authorizeAction } from '@/modules/core/lib/auth-guard';
import { executeQuery } from '@/modules/core/lib/sql-service';

function archiveDeletedRecordSync(db: any, params: {
    originalId: number;
    vehicleId: number | null;
    logType: 'fuel' | 'maintenance' | 'permit' | 'preventative_plan' | 'vehicle';
    date: string;
    amount: number | null;
    payload: any;
    deletedBy: string;
}) {
    db.prepare(`
        INSERT INTO ${FLEET_TABLES.archive} (originalId, vehicleId, logType, date, amount, payload, deletedBy)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        params.originalId,
        params.vehicleId,
        params.logType,
        params.date,
        params.amount,
        JSON.stringify(params.payload),
        params.deletedBy
    );
}

/**
 * FLEET MODULE DATABASE OPERATIONS
 */

// --- Settings / Catalogs ---
export async function getFleetSettings() {
    const db = await getDb();
    try {
        const rows = db.prepare(`SELECT * FROM ${FLEET_TABLES.settings} ORDER BY category, value`).all() as any[];
        return JSON.parse(JSON.stringify(rows));
    } catch (error) {
        console.error("Error getting fleet settings", error);
        return [];
    }
}

const CATEGORY_PERMISSIONS: Record<string, any> = {
    'brand': 'fleet:settings:brands',
    'fuel_type': 'fleet:settings:fuel',
    'permit_type': 'fleet:settings:permits',
    'maintenance_type': 'fleet:settings:maintenance',
    'notification_email': 'fleet:settings:notifications',
    'driver': 'fleet:settings:drivers'
};

export async function saveFleetSetting(category: string, value: string, price: number = 0) {
    const requiredPermission = CATEGORY_PERMISSIONS[category] || 'fleet:settings:manage';
    await authorizeAction(requiredPermission);
    
    const db = await getDb();
    try {
        db.prepare(`INSERT OR IGNORE INTO ${FLEET_TABLES.settings} (category, value, price) VALUES (?, ?, ?)`).run(category, value, price);
        await logInfo(`Fleet setting added: ${category} - ${value} (Price: ${price})`);
    } catch (error) {
        console.error("Error saving fleet setting", error);
        throw error;
    }
}

export async function updateFleetFuelPrice(id: number, newPrice: number) {
    const session = await authorizeAction('fleet:settings:fuel');
    const db = await getDb();
    
    try {
        const transaction = db.transaction(() => {
            // Update the setting
            const result = db.prepare(`UPDATE ${FLEET_TABLES.settings} SET price = ? WHERE id = ? AND category = 'fuel_type'`).run(newPrice, id);
            
            if (result.changes > 0) {
                // Record the history
                db.prepare(`
                    INSERT INTO ${FLEET_TABLES.fuelPriceHistory} (fuelTypeId, price, date, createdBy) 
                    VALUES (?, ?, ?, ?)
                `).run(
                    id, 
                    newPrice, 
                    new Date().toISOString(), 
                    session.name || session.email
                );
            }
        });
        
        transaction();
        await logInfo(`Fuel price updated for setting ID: ${id} to ${newPrice}`);
    } catch (error) {
        console.error("Error updating fuel price", error);
        throw error;
    }
}

export async function syncRecopePrices(data: any[]) {
    const session = await authorizeAction('fleet:fuel:sync');
    const db = await getDb();
    let updatedCount = 0;

    try {
        const transaction = db.transaction(() => {
            for (const item of data) {
                const nomprod = item.nomprod?.trim();
                const price = parseFloat(item.preciototal);
                if (!nomprod || isNaN(price)) continue;

                const existing = db.prepare(`SELECT id, price FROM ${FLEET_TABLES.settings} WHERE category = 'fuel_type' AND value = ?`).get(nomprod) as any;
                
                if (existing) {
                    if (existing.price !== price) {
                        db.prepare(`UPDATE ${FLEET_TABLES.settings} SET price = ? WHERE id = ?`).run(price, existing.id);
                        db.prepare(`
                            INSERT INTO ${FLEET_TABLES.fuelPriceHistory} (fuelTypeId, price, date, createdBy) 
                            VALUES (?, ?, ?, ?)
                        `).run(existing.id, price, new Date().toISOString(), session.name || session.email);
                        updatedCount++;
                    }
                } else {
                    const info = db.prepare(`INSERT INTO ${FLEET_TABLES.settings} (category, value, price) VALUES ('fuel_type', ?, ?)`).run(nomprod, price);
                    db.prepare(`
                        INSERT INTO ${FLEET_TABLES.fuelPriceHistory} (fuelTypeId, price, date, createdBy) 
                        VALUES (?, ?, ?, ?)
                    `).run(info.lastInsertRowid, price, new Date().toISOString(), session.name || session.email);
                    updatedCount++;
                }
            }
        });
        
        transaction();
        if (updatedCount > 0) {
            await logInfo(`Sincronización RECOPE: ${updatedCount} precios actualizados.`);
        }
        return updatedCount;
    } catch (error) {
        console.error("Error syncing RECOPE prices", error);
        throw error;
    }
}

export async function deleteFleetSetting(id: number) {
    const db = await getDb();
    try {
        const setting = db.prepare(`SELECT category FROM ${FLEET_TABLES.settings} WHERE id = ?`).get(id) as { category: string } | undefined;
        if (setting) {
            const requiredPermission = CATEGORY_PERMISSIONS[setting.category] || 'fleet:settings:manage';
            await authorizeAction(requiredPermission);
        } else {
            await authorizeAction('fleet:settings:manage');
        }

        db.prepare(`DELETE FROM ${FLEET_TABLES.settings} WHERE id = ?`).run(id);
    } catch (error) {
        console.error("Error deleting fleet setting", error);
        throw error;
    }
}

// --- Vehicles ---

export async function getAllVehicles() {
    const db = await getDb();
    try {
        const rows = db.prepare(`
            SELECT v.*, 
                (SELECT COUNT(*) FROM ${FLEET_TABLES.permits} p 
                 WHERE p.vehicleId = v.id 
                   AND p.expirationDate IS NOT NULL 
                   AND (julianday(p.expirationDate) - julianday('now')) < 30
                ) as expiringPermitsCount,
                (SELECT COUNT(*) FROM fleet_preventative_plans p 
                 WHERE p.vehicleId = v.id 
                   AND (
                     (p.intervalUnit = 'km' AND v.currentMileage >= p.lastPerformedValue + p.intervalValue)
                     OR
                     (p.intervalUnit = 'hours' AND IFNULL(v.currentHours, 0) >= p.lastPerformedValue + p.intervalValue)
                   )
                ) as preventativeAlertsCount,
                (SELECT MAX(d) FROM (
                    SELECT MAX(date) as d FROM ${FLEET_TABLES.fuelLogs} WHERE vehicleId = v.id
                    UNION ALL
                    SELECT MAX(date) as d FROM ${FLEET_TABLES.maintenanceLogs} WHERE vehicleId = v.id
                )) as lastActivityDate
            FROM ${FLEET_TABLES.vehicles} v 
            ORDER BY v.plate
        `).all() as any[];
        return JSON.parse(JSON.stringify(rows));
    } catch (error) {
        console.error("Error getting vehicles", error);
        return [];
    }
}

export async function getVehicleById(id: number) {
    const db = await getDb();
    try {
        const row = db.prepare(`SELECT * FROM ${FLEET_TABLES.vehicles} WHERE id = ?`).get(id) as any;
        return row ? JSON.parse(JSON.stringify(row)) : null;
    } catch (error) {
        console.error("Error getting vehicle by id", error);
        return null;
    }
}

export async function saveVehicle(vehicle: any) {
    await authorizeAction(vehicle.id ? 'fleet:vehicles:update' : 'fleet:vehicles:create');
    const db = await getDb();
    try {
        if (vehicle.id) {
            const stmt = db.prepare(`
                UPDATE ${FLEET_TABLES.vehicles} SET 
                plate = @plate, brand = @brand, model = @model, year = @year, 
                fuelType = @fuelType, loadCapacity = @loadCapacity, axes = @axes,
                currentMileage = @currentMileage, lastOilChangeMileage = @lastOilChangeMileage,
                oilChangeInterval = @oilChangeInterval, rtvExpiration = @rtvExpiration,
                photoUrl = @photoUrl, branchId = @branchId, status = @status,
                serialNumber = @serialNumber, vin = @vin, chassisNumber = @chassisNumber,
                bodyType = @bodyType, traction = @traction, capacity = @capacity,
                engineNumber = @engineNumber, engineBrand = @engineBrand, engineSerial = @engineSerial,
                engineModel = @engineModel, engineCylinders = @engineCylinders,
                engineDisplacement = @engineDisplacement, enginePower = @enginePower,
                engineManufacturer = @engineManufacturer, origin = @origin,
                ownerName = @ownerName, ownerId = @ownerId, odometerUnit = @odometerUnit,
                color = @color
                WHERE id = @id
            `);
            stmt.run(vehicle);
        } else {
            const stmt = db.prepare(`
                INSERT INTO ${FLEET_TABLES.vehicles} (
                    plate, brand, model, year, fuelType, loadCapacity, axes, 
                    currentMileage, lastOilChangeMileage, oilChangeInterval, 
                    rtvExpiration, photoUrl, branchId, status,
                    serialNumber, vin, chassisNumber, bodyType, traction, capacity,
                    engineNumber, engineBrand, engineSerial, engineModel, engineCylinders,
                    engineDisplacement, enginePower, engineManufacturer, origin,
                    ownerName, ownerId, odometerUnit, color
                ) VALUES (
                    @plate, @brand, @model, @year, @fuelType, @loadCapacity, @axes,
                    @currentMileage, @lastOilChangeMileage, @oilChangeInterval,
                    @rtvExpiration, @photoUrl, @branchId, @status,
                    @serialNumber, @vin, @chassisNumber, @bodyType, @traction, @capacity,
                    @engineNumber, @engineBrand, @engineSerial, @engineModel, @engineCylinders,
                    @engineDisplacement, @enginePower, @engineManufacturer, @origin,
                    @ownerName, @ownerId, @odometerUnit, @color
                )
            `);
            stmt.run(vehicle);
        }
        await logInfo(`Vehicle saved: ${vehicle.plate}`);
    } catch (error) {
        console.error("Error saving vehicle", error);
        throw error;
    }
}

export async function deleteVehicle(id: number) {
    const session = await authorizeAction('fleet:vehicles:delete');
    const db = await getDb();
    try {
        const vehicle = db.prepare(`SELECT * FROM ${FLEET_TABLES.vehicles} WHERE id = ?`).get(id) as any;
        if (vehicle) {
            archiveDeletedRecordSync(db, {
                originalId: id,
                vehicleId: null,
                logType: 'vehicle',
                date: new Date().toISOString(),
                amount: null,
                payload: vehicle,
                deletedBy: session.name || session.email || 'Sistema'
            });
        }
        const stmt = db.prepare(`DELETE FROM ${FLEET_TABLES.vehicles} WHERE id = ?`);
        stmt.run(id);
        await logInfo(`Vehicle deleted ID: ${id}`);
    } catch (error) {
        console.error("Error deleting vehicle", error);
        throw error;
    }
}

export async function updateVehicleMileageAndCheckAlerts(
    db: any,
    vehicleId: number,
    newMileage: number | null,
    newHours: number | null
): Promise<void> {
    try {
        const vehicle = db.prepare(`SELECT * FROM ${FLEET_TABLES.vehicles} WHERE id = ?`).get(vehicleId) as any;
        if (!vehicle) return;

        let mileageUpdated = false;
        let hoursUpdated = false;

        if (newMileage !== null && newMileage !== undefined) {
            const updated = db.prepare(`
                UPDATE ${FLEET_TABLES.vehicles}
                SET currentMileage = MAX(IFNULL(currentMileage, 0), ?)
                WHERE id = ?
            `).run(newMileage, vehicleId);
            if (updated.changes > 0) mileageUpdated = true;
        }

        if (newHours !== null && newHours !== undefined) {
            const updated = db.prepare(`
                UPDATE ${FLEET_TABLES.vehicles}
                SET currentHours = MAX(IFNULL(currentHours, 0), ?)
                WHERE id = ?
            `).run(newHours, vehicleId);
            if (updated.changes > 0) hoursUpdated = true;
        }

        if (!mileageUpdated && !hoursUpdated) return;

        const updatedVehicle = db.prepare(`SELECT * FROM ${FLEET_TABLES.vehicles} WHERE id = ?`).get(vehicleId) as any;
        if (!updatedVehicle) return;

        const currentMileage = updatedVehicle.currentMileage || 0;
        const currentHours = updatedVehicle.currentHours || 0;

        // 1. Oil change alerts
        if (updatedVehicle.oilChangeInterval > 0) {
            const mileageSinceLast = currentMileage - (updatedVehicle.lastOilChangeMileage || 0);
            const progress = (mileageSinceLast / updatedVehicle.oilChangeInterval) * 100;
            
            if (progress >= 90) {
                const { triggerNotificationEvent } = await import('@/modules/notifications/lib/notifications-engine');
                await triggerNotificationEvent('onFleetMaintenanceDue', {
                    ...updatedVehicle,
                    currentMileage,
                    progress: progress.toFixed(0),
                    remaining: Math.max(0, updatedVehicle.oilChangeInterval - mileageSinceLast),
                    odometerUnit: updatedVehicle.odometerUnit || 'km'
                });
            }
        }

        // 2. Preventative plans alerts
        const plans = db.prepare('SELECT * FROM fleet_preventative_plans WHERE vehicleId = ?').all(vehicleId) as any[];
        for (const plan of plans) {
            const currentVal = (plan.intervalUnit === 'hours') ? currentHours : currentMileage;
            const diff = currentVal - (plan.lastPerformedValue || 0);
            const progress = (diff / plan.intervalValue) * 100;

            if (progress >= 90) {
                const { triggerNotificationEvent } = await import('@/modules/notifications/lib/notifications-engine');
                await triggerNotificationEvent('onFleetMaintenanceDue', {
                    ...updatedVehicle,
                    maintenanceType: plan.maintenanceType,
                    currentMileage: currentVal,
                    progress: progress.toFixed(0),
                    remaining: Math.max(0, plan.intervalValue - diff),
                    odometerUnit: plan.intervalUnit || 'km'
                });
            }
        }
    } catch (e: any) {
        logError('Error in updateVehicleMileageAndCheckAlerts:', e.message);
    }
}

// --- Logs (Fuel & Maintenance) ---

export async function saveFuelLog(log: any) {
    await authorizeAction('fleet:fuel:create');
    const db = await getDb();
    try {
        const transaction = db.transaction((data) => {
            db.prepare(`
                INSERT INTO ${FLEET_TABLES.fuelLogs} (vehicleId, date, mileageBefore, liters, cost, driverId, fuelTypeId, notes, createdBy)
                VALUES (@vehicleId, @date, @mileageBefore, @liters, @cost, @driverId, @fuelTypeId, @notes, @createdBy)
            `).run(data);

            // Update current mileage using central function inside the transaction
            // Note: Since central function runs inline SQL, we execute it directly
            const vehicle = db.prepare(`SELECT * FROM ${FLEET_TABLES.vehicles} WHERE id = ?`).get(data.vehicleId) as any;
            if (vehicle) {
                db.prepare(`
                    UPDATE ${FLEET_TABLES.vehicles} 
                    SET currentMileage = MAX(currentMileage, ?) 
                    WHERE id = ?
                `).run(data.mileageBefore, data.vehicleId);
            }
        });
        transaction(log);
        
        // Run alert calculations outside active write lock to allow concurrent mail sends
        await updateVehicleMileageAndCheckAlerts(db, log.vehicleId, log.mileageBefore, null);
        await logInfo(`Fuel log registered for vehicle ${log.vehicleId}`);
    } catch (error) {
        console.error("Error saving fuel log", error);
        throw error;
    }
}

export async function saveMaintenanceLog(log: any) {
    await authorizeAction('fleet:maintenance:create');
    const db = await getDb();
    try {
        const transaction = db.transaction((data) => {
            // 1. Fetch vehicle info for ticket description and details
            const vehicle = db.prepare(`SELECT plate, brand, model FROM ${FLEET_TABLES.vehicles} WHERE id = ?`).get(data.vehicleId) as { plate: string; brand: string | null; model: string | null } | undefined;
            const plate = vehicle?.plate || `Vehículo ${data.vehicleId}`;
            const brand = vehicle?.brand || '';
            const model = vehicle?.model || '';

            // 2. Fetch & lock next ticket consecutive settings for Department 1 (Taller de Flota)
            const settings = db.prepare('SELECT ticket_prefix, next_ticket_number FROM ticket_settings WHERE department_id = 1').get() as { ticket_prefix: string; next_ticket_number: number } | undefined;
            let consecutive = '';
            if (settings) {
                const prefix = settings.ticket_prefix;
                const nextNum = settings.next_ticket_number;
                consecutive = `${prefix}${String(nextNum).padStart(6, '0')}`;
                
                // Update next consecutive number
                db.prepare('UPDATE ticket_settings SET next_ticket_number = ? WHERE department_id = 1').run(nextNum + 1);
            } else {
                consecutive = `TKT-FLOT-${Date.now()}`;
            }

            // Determine if it is oil change or other for maintenance type if applicable
            const isOilChange = String(data.type).toLowerCase().includes('aceite');
            const maintenanceType = isOilChange ? 'preventive' : 'corrective';

            // 3. Insert completed ticket into repair_tickets
            const ticketInsertResult = db.prepare(`
                INSERT INTO repair_tickets (
                    consecutive, department_id, subject, description, status, priority,
                    maintenance_type, equipment_name, brand, model, serial_number, created_at, created_by,
                    closed_at, closed_by
                ) VALUES (?, 1, ?, ?, 'completed', 'medium', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                consecutive,
                data.type, // subject
                data.description || 'Mantenimiento registrado desde Flota', // description
                maintenanceType,
                `Vehículo Placa: ${plate}`, // equipment_name
                brand,
                model,
                plate, // serial_number (license plate)
                data.date, // created_at
                data.createdBy || 'Sistema', // created_by
                data.date, // closed_at
                data.createdBy || 'Sistema' // closed_by
            );

            const ticketId = ticketInsertResult.lastInsertRowid;

            // 4. Insert into fleet_maintenance_logs with ticket_id
            db.prepare(`
                INSERT INTO ${FLEET_TABLES.maintenanceLogs} (vehicleId, date, mileage, type, description, cost, performedBy, createdBy, ticket_id)
                VALUES (@vehicleId, @date, @mileage, @type, @description, @cost, @performedBy, @createdBy, @ticketId)
            `).run({ ...data, ticketId });

            // 5. If it's an oil change, update the last oil change mileage
            if (isOilChange) {
                db.prepare(`
                    UPDATE ${FLEET_TABLES.vehicles} 
                    SET lastOilChangeMileage = ?, currentMileage = MAX(currentMileage, ?), lastOilChangeAlertThreshold = 0
                    WHERE id = ?
                `).run(data.mileage, data.mileage, data.vehicleId);
            } else {
                db.prepare(`
                    UPDATE ${FLEET_TABLES.vehicles} 
                    SET currentMileage = MAX(currentMileage, ?)
                    WHERE id = ?
                `).run(data.mileage, data.vehicleId);
            }

            // Auto update preventative plans lastPerformedValue and reset threshold
            db.prepare(`
                UPDATE fleet_preventative_plans
                SET lastPerformedValue = ?, lastAlertThreshold = 0
                WHERE vehicleId = ? AND maintenanceType = ?
            `).run(data.mileage, data.vehicleId, data.type);
        });
        transaction(log);

        // Run alert calculations outside active transaction
        await updateVehicleMileageAndCheckAlerts(db, log.vehicleId, log.mileage, null);
        await logInfo(`Maintenance log (${log.type}) registered for vehicle ${log.vehicleId}`);
    } catch (error) {
        console.error("Error saving maintenance log", error);
        throw error;
    }
}

export async function deleteFuelLog(id: number) {
    const session = await authorizeAction('fleet:fuel:delete');
    const db = await getDb();
    try {
        const transaction = db.transaction(() => {
            const log = db.prepare(`SELECT * FROM ${FLEET_TABLES.fuelLogs} WHERE id = ?`).get(id) as any;
            if (!log) return;

            archiveDeletedRecordSync(db, {
                originalId: id,
                vehicleId: log.vehicleId,
                logType: 'fuel',
                date: log.date,
                amount: log.cost || null,
                payload: log,
                deletedBy: session.name || session.email || 'Sistema'
            });

            db.prepare(`DELETE FROM ${FLEET_TABLES.fuelLogs} WHERE id = ?`).run(id);

            const maxFuel = db.prepare(`SELECT MAX(mileageBefore) as maxM FROM ${FLEET_TABLES.fuelLogs} WHERE vehicleId = ?`).get(log.vehicleId) as { maxM: number | null } | undefined;
            const maxMaint = db.prepare(`SELECT MAX(mileage) as maxM FROM ${FLEET_TABLES.maintenanceLogs} WHERE vehicleId = ?`).get(log.vehicleId) as { maxM: number | null } | undefined;
            const newMaxMileage = Math.max(maxFuel?.maxM || 0, maxMaint?.maxM || 0);

            if (newMaxMileage > 0) {
                db.prepare(`UPDATE ${FLEET_TABLES.vehicles} SET currentMileage = ? WHERE id = ?`).run(newMaxMileage, log.vehicleId);
            }
        });
        transaction();
        await logInfo(`Fuel log deleted ID: ${id}`);
    } catch (error) {
        console.error("Error deleting fuel log", error);
        throw error;
    }
}

export async function deleteMaintenanceLog(id: number) {
    const session = await authorizeAction('fleet:maintenance:delete');
    const db = await getDb();
    try {
        const transaction = db.transaction(() => {
            const log = db.prepare(`SELECT * FROM ${FLEET_TABLES.maintenanceLogs} WHERE id = ?`).get(id) as any;
            if (!log) return;

            archiveDeletedRecordSync(db, {
                originalId: id,
                vehicleId: log.vehicleId,
                logType: 'maintenance',
                date: log.date,
                amount: log.cost || null,
                payload: log,
                deletedBy: session.name || session.email || 'Sistema'
            });

            db.prepare(`DELETE FROM ${FLEET_TABLES.maintenanceLogs} WHERE id = ?`).run(id);

            const maxFuel = db.prepare(`SELECT MAX(mileageBefore) as maxM FROM ${FLEET_TABLES.fuelLogs} WHERE vehicleId = ?`).get(log.vehicleId) as { maxM: number | null } | undefined;
            const maxMaint = db.prepare(`SELECT MAX(mileage) as maxM FROM ${FLEET_TABLES.maintenanceLogs} WHERE vehicleId = ?`).get(log.vehicleId) as { maxM: number | null } | undefined;
            const newMaxMileage = Math.max(maxFuel?.maxM || 0, maxMaint?.maxM || 0);

            if (newMaxMileage > 0) {
                db.prepare(`UPDATE ${FLEET_TABLES.vehicles} SET currentMileage = ? WHERE id = ?`).run(newMaxMileage, log.vehicleId);
            }

            const isOilChange = String(log.type).toLowerCase().includes('aceite');
            if (isOilChange) {
                const lastOilMaint = db.prepare(`
                    SELECT mileage FROM ${FLEET_TABLES.maintenanceLogs} 
                    WHERE vehicleId = ? AND (type LIKE '%aceite%' OR type LIKE '%Aceite%' OR type LIKE '%ACEITE%')
                    ORDER BY date DESC LIMIT 1
                `).get(log.vehicleId) as { mileage: number } | undefined;

                const lastOilChangeMileage = lastOilMaint ? lastOilMaint.mileage : 0;
                db.prepare(`UPDATE ${FLEET_TABLES.vehicles} SET lastOilChangeMileage = ?, lastOilChangeAlertThreshold = 0 WHERE id = ?`).run(lastOilChangeMileage, log.vehicleId);
            }
        });
        transaction();
        await logInfo(`Maintenance log deleted ID: ${id}`);
    } catch (error) {
        console.error("Error deleting maintenance log", error);
        throw error;
    }
}

export async function savePermit(permit: any) {
    await authorizeAction('fleet:vehicles:update');
    const db = await getDb();
    try {
        db.prepare(`
            INSERT INTO ${FLEET_TABLES.permits} (vehicleId, type, expirationDate, documentUrl, amount)
            VALUES (@vehicleId, @type, @expirationDate, @documentUrl, @amount)
        `).run(permit);
        await logInfo(`Permit added (${permit.type}) for vehicle ${permit.vehicleId} with amount: ${permit.amount}`);
    } catch (error) {
        console.error("Error saving permit", error);
        throw error;
    }
}

export async function getVehicleLogs(vehicleId: number) {
    const db = await getDb();
    try {
        const fuelLogs = db.prepare(`SELECT * FROM ${FLEET_TABLES.fuelLogs} WHERE vehicleId = ? ORDER BY date DESC`).all(vehicleId);
        const maintenanceLogs = db.prepare(`SELECT * FROM ${FLEET_TABLES.maintenanceLogs} WHERE vehicleId = ? ORDER BY date DESC`).all(vehicleId);
        const permits = db.prepare(`SELECT * FROM ${FLEET_TABLES.permits} WHERE vehicleId = ? ORDER BY expirationDate ASC`).all(vehicleId);

        return JSON.parse(JSON.stringify({ fuelLogs, maintenanceLogs, permits }));
    } catch (error) {
        console.error("Error getting vehicle logs", error);
        return { fuelLogs: [], maintenanceLogs: [], permits: [] };
    }
}

// --- Driver Integration ---

export async function getDriversFromERP(includeInactive: boolean = false) {
    const db = await getDb();
    try {
        // Fetch strictly from the local SQLite database, enforcing the offline-first architecture
        // Restricted to only employees manually added as drivers in fleet settings
        const driverIds = db.prepare(`SELECT value FROM ${FLEET_TABLES.settings} WHERE category = 'driver'`).all() as { value: string }[];
        const ids = driverIds.map(d => d.value);
        
        if (ids.length === 0) return [];
        
        const placeholders = ids.map(() => '?').join(',');
        const query = includeInactive 
            ? `SELECT * FROM core_employees WHERE EMPLEADO IN (${placeholders}) ORDER BY NOMBRE`
            : `SELECT * FROM core_employees WHERE ACTIVO = 'S' AND EMPLEADO IN (${placeholders}) ORDER BY NOMBRE`;
        const rows = db.prepare(query).all(...ids) as any[];
        
        const drivers = rows.map((r: any) => ({
            id: r.EMPLEADO,
            name: r.NOMBRE,
            active: r.ACTIVO,
            ...r
        }));
            
        return JSON.parse(JSON.stringify(drivers));
    } catch (error) {
        console.error("Error getting drivers from local DB", error);
        return [];
    }
}

export async function getAllEmployees() {
    const db = await getDb();
    try {
        const employees = db.prepare("SELECT EMPLEADO as id, NOMBRE as name, ACTIVO as active, PUESTO, DEPARTAMENTO FROM core_employees ORDER BY NOMBRE").all() as any[];
        const users = db.prepare("SELECT 'U-' || id as id, name, 'S' as active, role as PUESTO, 'Usuario Local' as DEPARTAMENTO FROM core_users ORDER BY name").all() as any[];
        const merged = [...employees, ...users];
        return JSON.parse(JSON.stringify(merged));
    } catch (error) {
        console.error("Error getting all employees from local DB", error);
        return [];
    }
}

export async function getAllActiveEmployees() {
    const db = await getDb();
    try {
        const employees = db.prepare("SELECT EMPLEADO as id, NOMBRE as name, PUESTO, DEPARTAMENTO FROM core_employees WHERE ACTIVO = 'S' ORDER BY NOMBRE").all() as any[];
        const users = db.prepare("SELECT 'U-' || id as id, name, role as PUESTO, 'Usuario Local' as DEPARTAMENTO FROM core_users ORDER BY name").all() as any[];
        const merged = [...employees, ...users];
        return JSON.parse(JSON.stringify(merged));
    } catch (error) {
        console.error("Error getting all active employees from local DB", error);
        return [];
    }
}

export async function getAllFuelLogs() {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT * FROM fleet_fuel_logs ORDER BY date DESC').all();
        return JSON.parse(JSON.stringify(rows));
    } catch (error) {
        console.error('Error getting all fuel logs', error);
        return [];
    }
}

export async function deletePermit(id: number) {
    const session = await authorizeAction('fleet:vehicles:update');
    const db = await getDb();
    try {
        const permit = db.prepare(`SELECT * FROM ${FLEET_TABLES.permits} WHERE id = ?`).get(id) as any;
        if (permit) {
            archiveDeletedRecordSync(db, {
                originalId: id,
                vehicleId: permit.vehicleId,
                logType: 'permit',
                date: permit.expirationDate,
                amount: permit.amount || null,
                payload: permit,
                deletedBy: session.name || session.email || 'Sistema'
            });
        }
        db.prepare(`DELETE FROM ${FLEET_TABLES.permits} WHERE id = ?`).run(id);
    } catch (error) {
        console.error("Error deleting permit", error);
        throw error;
    }
}

export async function getVehiclePreventativePlans(vehicleId: number) {
    const db = await getDb();
    try {
        const rows = db.prepare('SELECT * FROM fleet_preventative_plans WHERE vehicleId = ?').all(vehicleId);
        return JSON.parse(JSON.stringify(rows));
    } catch (error) {
        console.error("Error getting preventative plans", error);
        return [];
    }
}

export async function savePreventativePlan(data: {
    vehicleId: number;
    maintenanceType: string;
    intervalValue: number;
    intervalUnit: string;
    lastPerformedValue: number;
}) {
    await authorizeAction('fleet:vehicles:update');
    const db = await getDb();
    try {
        const existing = db.prepare('SELECT id FROM fleet_preventative_plans WHERE vehicleId = ? AND maintenanceType = ?').get(data.vehicleId, data.maintenanceType) as any;
        if (existing) {
            db.prepare(`
                UPDATE fleet_preventative_plans 
                SET intervalValue = ?, intervalUnit = ?, lastPerformedValue = ?
                WHERE id = ?
            `).run(data.intervalValue, data.intervalUnit, data.lastPerformedValue, existing.id);
        } else {
            db.prepare(`
                INSERT INTO fleet_preventative_plans (vehicleId, maintenanceType, intervalValue, intervalUnit, lastPerformedValue)
                VALUES (?, ?, ?, ?, ?)
            `).run(data.vehicleId, data.maintenanceType, data.intervalValue, data.intervalUnit, data.lastPerformedValue);
        }
    } catch (error) {
        console.error("Error saving preventative plan", error);
        throw error;
    }
}

export async function deletePreventativePlan(id: number) {
    const session = await authorizeAction('fleet:vehicles:update');
    const db = await getDb();
    try {
        const plan = db.prepare(`SELECT * FROM fleet_preventative_plans WHERE id = ?`).get(id) as any;
        if (plan) {
            archiveDeletedRecordSync(db, {
                originalId: id,
                vehicleId: plan.vehicleId,
                logType: 'preventative_plan',
                date: new Date().toISOString().split('T')[0],
                amount: plan.intervalValue || null,
                payload: plan,
                deletedBy: session.name || session.email || 'Sistema'
            });
        }
        db.prepare('DELETE FROM fleet_preventative_plans WHERE id = ?').run(id);
    } catch (error) {
        console.error("Error deleting preventative plan", error);
        throw error;
    }
}

// --- Soft-Deleted Logs (Papelera de Reciclaje / Auditoría) ---

export async function getDeletedLogs(vehicleId: number) {
    const db = await getDb();
    try {
        const rows = db.prepare(`
            SELECT * FROM ${FLEET_TABLES.archive} 
            WHERE vehicleId = ? 
            ORDER BY deletedAt DESC
        `).all(vehicleId) as any[];
        return JSON.parse(JSON.stringify(rows));
    } catch (error) {
        console.error("Error getting deleted logs", error);
        return [];
    }
}

export async function getDeletedVehicles() {
    await authorizeAction('fleet:vehicles:read');
    const db = await getDb();
    try {
        const rows = db.prepare(`
            SELECT * FROM ${FLEET_TABLES.archive} 
            WHERE logType = 'vehicle' 
            ORDER BY deletedAt DESC
        `).all() as any[];
        return JSON.parse(JSON.stringify(rows));
    } catch (error) {
        console.error("Error getting deleted vehicles", error);
        return [];
    }
}

export async function restoreDeletedLog(archiveId: number) {
    await authorizeAction('fleet:vehicles:update');
    const db = await getDb();
    try {
        const row = db.prepare(`SELECT * FROM ${FLEET_TABLES.archive} WHERE id = ?`).get(archiveId) as any;
        if (!row) throw new Error("Registro no encontrado en la papelera de eliminados.");

        const payload = JSON.parse(row.payload);
        const transaction = db.transaction(() => {
            if (row.logType === 'fuel') {
                db.prepare(`
                    INSERT OR REPLACE INTO ${FLEET_TABLES.fuelLogs} (id, vehicleId, date, mileageBefore, liters, cost, driverId, fuelTypeId, notes, createdBy)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    payload.id,
                    payload.vehicleId,
                    payload.date,
                    payload.mileageBefore,
                    payload.liters,
                    payload.cost,
                    payload.driverId,
                    payload.fuelTypeId,
                    payload.notes,
                    payload.createdBy
                );

                // Update vehicle current mileage if higher
                db.prepare(`
                    UPDATE ${FLEET_TABLES.vehicles} 
                    SET currentMileage = MAX(currentMileage, ?) 
                    WHERE id = ?
                `).run(payload.mileageBefore, payload.vehicleId);

            } else if (row.logType === 'maintenance') {
                db.prepare(`
                    INSERT OR REPLACE INTO ${FLEET_TABLES.maintenanceLogs} (id, vehicleId, date, mileage, type, description, cost, performedBy, createdBy)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    payload.id,
                    payload.vehicleId,
                    payload.date,
                    payload.mileage,
                    payload.type,
                    payload.description,
                    payload.cost,
                    payload.performedBy,
                    payload.createdBy
                );

                // Update oil change mileage or regular mileage
                const isOilChange = String(payload.type).toLowerCase().includes('aceite');
                if (isOilChange) {
                    db.prepare(`
                        UPDATE ${FLEET_TABLES.vehicles} 
                        SET lastOilChangeMileage = ?, currentMileage = MAX(currentMileage, ?), lastOilChangeAlertThreshold = 0
                        WHERE id = ?
                    `).run(payload.mileage, payload.mileage, payload.vehicleId);
                } else {
                    db.prepare(`
                        UPDATE ${FLEET_TABLES.vehicles} 
                        SET currentMileage = MAX(currentMileage, ?)
                        WHERE id = ?
                    `).run(payload.mileage, payload.vehicleId);
                }

            } else if (row.logType === 'permit') {
                db.prepare(`
                    INSERT OR REPLACE INTO ${FLEET_TABLES.permits} (id, vehicleId, type, expirationDate, documentUrl)
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    payload.id,
                    payload.vehicleId,
                    payload.type,
                    payload.expirationDate,
                    payload.documentUrl
                );

            } else if (row.logType === 'preventative_plan') {
                db.prepare(`
                    INSERT OR REPLACE INTO fleet_preventative_plans (id, vehicleId, maintenanceType, intervalValue, intervalUnit, lastPerformedValue, lastAlertThreshold)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    payload.id,
                    payload.vehicleId,
                    payload.maintenanceType,
                    payload.intervalValue,
                    payload.intervalUnit,
                    payload.lastPerformedValue,
                    payload.lastAlertThreshold
                );

            } else if (row.logType === 'vehicle') {
                db.prepare(`
                    INSERT OR REPLACE INTO ${FLEET_TABLES.vehicles} (
                        id, plate, brand, model, year, fuelType, loadCapacity, axes, 
                        currentMileage, lastOilChangeMileage, oilChangeInterval, rtvExpiration, 
                        photoUrl, branchId, status, serialNumber, vin, chassisNumber, bodyType, 
                        traction, capacity, engineNumber, engineBrand, engineSerial, engineModel, 
                        engineCylinders, engineDisplacement, enginePower, engineManufacturer, 
                        origin, ownerName, ownerId, odometerUnit, lastOilChangeAlertThreshold, 
                        currentHours, color
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, ?, 
                        ?, ?, ?, ?, 
                        ?, ?, ?, ?, ?, 
                        ?, ?
                    )
                `).run(
                    payload.id, payload.plate, payload.brand, payload.model, payload.year, payload.fuelType, payload.loadCapacity, payload.axes,
                    payload.currentMileage, payload.lastOilChangeMileage, payload.oilChangeInterval, payload.rtvExpiration,
                    payload.photoUrl, payload.branchId, payload.status, payload.serialNumber, payload.vin, payload.chassisNumber, payload.bodyType,
                    payload.traction, payload.capacity, payload.engineNumber, payload.engineBrand, payload.engineSerial, payload.engineModel,
                    payload.engineCylinders, payload.engineDisplacement, payload.enginePower, payload.engineManufacturer,
                    payload.origin, payload.ownerName, payload.ownerId, payload.odometerUnit, payload.lastOilChangeAlertThreshold,
                    payload.currentHours, payload.color
                );
            }

            // Remove from archive table
            db.prepare(`DELETE FROM ${FLEET_TABLES.archive} WHERE id = ?`).run(archiveId);
        });

        transaction();
        await logInfo(`Vehicle log successfully restored from archive ID: ${archiveId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Error restoring log", error);
        return { success: false, error: error.message };
    }
}
