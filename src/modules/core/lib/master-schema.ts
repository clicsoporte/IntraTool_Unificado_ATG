/**
 * @fileoverview MASTER_SCHEMA defines the "ideal" state of the unified database.
 * This is used by the integrity audit system to detect missing tables or columns.
 */

export const MASTER_SCHEMA: Record<string, string[]> = {
    // --- CORE MODULE ---
    core_users: [
        'id', 'name', 'email', 'password', 'phone', 'whatsapp', 'erpAlias', 'avatar', 
        'role', 'recentActivity', 'securityQuestion', 'securityAnswer', 'forcePasswordChange', 'activeWizardSession', 'employeeId', 'salespersonId', 'is_active'
    ],
    core_roles: ['id', 'name', 'permissions'],
    core_company_settings: [
        'id', 'name', 'taxId', 'address', 'phone', 'email', 'logoUrl', 'systemName', 
        'publicUrl', 'systemVersion', 'quotePrefix', 'nextQuoteNumber', 'decimalPlaces', 
        'quoterShowTaxId', 'searchDebounceTime', 'syncWarningHours', 'lastSyncTimestamp', 
        'importMode', 'customerFilePath', 'productFilePath', 'exemptionFilePath', 
        'stockFilePath', 'locationFilePath', 'cabysFilePath', 'supplierFilePath', 
        'erpPurchaseOrderHeaderFilePath', 'erpPurchaseOrderLineFilePath', 
        'erpInvoiceHeaderFilePath', 'erpInvoiceLineFilePath', 'timeZone'
    ],
    core_logs: ['id', 'timestamp', 'type', 'message', 'details'],
    core_api_settings: ['id', 'exchangeRateApi', 'haciendaExemptionApi', 'haciendaTributariaApi', 'recopeApi'],
    core_analytics_settings: ['key', 'value'],
    core_customers: [
        'id', 'name', 'address', 'phone', 'taxId', 'currency', 'creditLimit', 
        'paymentCondition', 'salesperson', 'active', 'email', 'electronicDocEmail'
    ],
    core_products: [
        'id', 'description', 'classification', 'lastEntry', 'active', 'notes', 
        'unit', 'isBasicGood', 'cabys', 'barcode'
    ],
    core_exemptions: [
        'code', 'description', 'customer', 'authNumber', 'startDate', 'endDate', 
        'percentage', 'docType', 'institutionName', 'institutionCode'
    ],
    core_quote_drafts: [
        'id', 'createdAt', 'userId', 'customerId', 'customerDetails', 'lines', 
        'totals', 'notes', 'currency', 'exchangeRate', 'purchaseOrderNumber', 
        'deliveryAddress', 'deliveryDate', 'sellerName', 'sellerType', 'quoteDate', 
        'validUntilDate', 'paymentTerms', 'creditDays'
    ],
    core_exemption_laws: ['docType', 'institutionName', 'authNumber'],
    core_cabys_catalog: ['code', 'description', 'taxRate'],
    core_stock: ['itemId', 'stockByWarehouse', 'totalStock'],
    core_sql_config: ['key', 'value'],
    core_import_queries: ['type', 'query'],
    core_suggestions: ['id', 'content', 'userId', 'userName', 'isRead', 'timestamp'],
    core_user_preferences: ['userId', 'key', 'value'],
    core_notifications: ['id', 'userId', 'message', 'href', 'isRead', 'timestamp', 'entityId', 'entityType', 'taskType'],
    core_email_settings: ['key', 'value'],
    core_suppliers: ['id', 'name', 'alias', 'email', 'phone'],
    core_erp_order_headers: [
        'PEDIDO', 'ESTADO', 'CLIENTE', 'FECHA_PEDIDO', 'FECHA_PROMETIDA', 
        'ORDEN_COMPRA', 'TOTAL_UNIDADES', 'MONEDA_PEDIDO', 'USUARIO'
    ],
    core_erp_order_lines: ['PEDIDO', 'PEDIDO_LINEA', 'ARTICULO', 'CANTIDAD_PEDIDA', 'PRECIO_UNITARIO'],
    core_erp_purchase_order_headers: ['ORDEN_COMPRA', 'PROVEEDOR', 'FECHA_HORA', 'ESTADO', 'CreatedBy'],
    core_erp_purchase_order_lines: ['ORDEN_COMPRA', 'ARTICULO', 'CANTIDAD_ORDENADA'],
    core_erp_invoice_headers: [
        'FACTURA', 'CLIENTE', 'NOMBRE_CLIENTE', 'TIPO_DOCUMENTO', 'PEDIDO', 
        'FACTURA_ORIGINAL', 'FECHA', 'FECHA_ENTREGA', 'ANULADA', 'DIREC_EMBARQUE', 'EMBARCAR_A', 
        'DIRECCION_FACTURA', 'OBSERVACIONES', 'RUTA', 'USUARIO', 'USUARIO_ANULA', 
        'ZONA', 'VENDEDOR', 'REIMPRESO'
    ],
    core_erp_invoice_lines: [
        'FACTURA', 'TIPO_DOCUMENTO', 'LINEA', 'BODEGA', 'PEDIDO', 'ARTICULO', 
        'ANULADA', 'FECHA_FACTURA', 'CANTIDAD', 'PRECIO_UNITARIO', 'TOTAL_IMPUESTO1', 
        'PRECIO_TOTAL', 'DESCRIPCION', 'DOCUMENTO_ORIGEN', 'CANT_DESPACHADA', 'ES_CANASTA_BASICA'
    ],
    core_stock_settings: ['key', 'value'],
    core_employees: [
        'EMPLEADO', 'NOMBRE', 'ACTIVO', 'DEPARTAMENTO', 'PUESTO', 'NOMINA',
        'IDENTIFICACION', 'DIRECCION_HAB', 'PASAPORTE', 'PAIS', 'PERMISO_CONDUCIR', 'FECHA_INGRESO', 'FECHA_SALIDA'
    ],
    core_departments: ['DEPARTAMENTO', 'DESCRIPCION'],
    core_positions: ['PUESTO', 'DESCRIPCION'],
    core_payrolls: ['NOMINA', 'DESCRIPCION', 'TIPO_NOMINA'],
    core_salespersons: ['VENDEDOR', 'NOMBRE', 'ACTIVO', 'EMPLEADO', 'E_MAIL', 'TELEFONO'],
    _core_migrations: ['module', 'version', 'last_updated'],
    core_geography_data: ['key', 'value', 'updatedAt'],

    // --- WAREHOUSE MODULE ---
    wh_locations: ['id', 'name', 'code', 'type', 'parentId', 'isLocked', 'lockedBy', 'lockedBySessionId', 'population_status', 'is_mixed', 'cached_full_path'],
    wh_inventory: ['id', 'itemId', 'locationId', 'quantity', 'lastUpdated', 'updatedBy'],
    wh_item_locations: ['id', 'itemId', 'locationId', 'clientId', 'isExclusive', 'requiresCertificate', 'updatedBy', 'updatedAt'],
    wh_inventory_units: [
        'id', 'unitCode', 'receptionConsecutive', 'correctionConsecutive', 'correctedFromUnitId', 
        'productId', 'humanReadableId', 'documentId', 'erpDocumentId', 'locationId', 
        'quantity', 'notes', 'createdAt', 'createdBy', 'status', 'appliedAt', 
        'appliedBy', 'annulledAt', 'annulledBy'
    ],
    wh_movements: ['id', 'itemId', 'quantity', 'fromLocationId', 'toLocationId', 'timestamp', 'userId', 'notes'],
    wh_config: ['key', 'value'],

    // --- OPERATIONS MODULE ---
    ops_types: ['id', 'name', 'description', 'prefix', 'nextNumber'],
    ops_documents: [
        'id', 'consecutive', 'documentTypeId', 'status', 'requestDate', 'notes', 
        'relatedProductionOrderId', 'relatedPurchaseRequestId', 'relatedCustomerId', 
        'requesterId', 'requesterName', 'requesterSignedAt', 'processorId', 
        'processorName', 'processorSignedAt'
    ],
    ops_lines: ['id', 'documentId', 'itemId', 'itemDescription', 'quantity', 'lotId', 'sourceLocationId', 'destinationLocationId'],
    ops_history: ['id', 'documentId', 'timestamp', 'status', 'notes', 'updatedBy'],
    ops_delivery_settings: ['key', 'value'],
    ops_delivery_routes: ['id', 'name', 'active'],
    ops_delivery_assignments: ['id', 'fecha', 'ruta_id', 'empleado_id', 'vehiculo_id', 'activa', 'fecha_completada', 'siguiente_cliente', 'siguiente_cliente_fecha', 'fecha_salida'],
    ops_delivery_queue: [
        'id', 'documento_numero', 'tipo_documento', 'cliente_id', 'cliente_nombre', 
        'asignacion_id', 'creado_por', 'entregado', 'estado', 'fecha_registro', 
        'fecha_entrega', 'comentario', 'release_code_id', 'canal_registro', 
        'gestionado_por', 'telegram_lock_at', 'telegram_lock_by', 'tipo_documento_erp', 
        'factura_original', 'latitud', 'longitud', 'foto_evidencia', 'foto_factura'
    ],
    ops_delivery_lines: [
        'id', 'delivery_order_id', 'producto_codigo', 'producto_descripcion', 
        'cantidad_pedida', 'cantidad_entregada', 'cantidad_faltante'
    ],
    ops_delivery_release_codes: [
        'id', 'codigo', 'delivery_order_id', 'generado_por', 'usado', 
        'fecha_generacion', 'fecha_expiracion', 'es_override'
    ],
    ops_delivery_notifications: [
        'id', 'delivery_order_id', 'usuario_erp', 'tipo', 'estado', 'error', 'fecha'
    ],
    ops_delivery_gps_logs: [
        'id', 'asignacion_id', 'latitud', 'longitud', 'timestamp'
    ],
    ops_client_emails: [
        'id', 'cliente_id', 'email', 'created_at'
    ],
    ops_delivery_discards: [
        'id', 'documento_numero', 'motivo_descarte', 'usuario_descarte', 'fecha_descarte'
    ],


    // --- PLANNER MODULE ---
    planner_settings: ['key', 'value'],
    planner_orders: [
        'id', 'consecutive', 'purchaseOrder', 'requestDate', 'deliveryDate', 
        'scheduledStartDate', 'scheduledEndDate', 'customerId', 'customerName', 
        'customerTaxId', 'productId', 'productDescription', 'quantity', 'inventory', 
        'inventoryErp', 'priority', 'status', 'pendingAction', 'notes', 'requestedBy', 
        'approvedBy', 'lastStatusUpdateBy', 'lastStatusUpdateNotes', 'lastModifiedBy', 
        'lastModifiedAt', 'hasBeenModified', 'deliveredQuantity', 'defectiveQuantity', 
        'erpPackageNumber', 'erpTicketNumber', 'reopened', 'machineId', 'shiftId', 
        'previousStatus', 'erpOrderNumber'
    ],
    planner_order_history: ['id', 'orderId', 'timestamp', 'status', 'notes', 'updatedBy'],

    // --- REQUESTS MODULE ---
    req_settings: ['key', 'value'],
    req_requests: [
        'id', 'consecutive', 'purchaseOrder', 'requestDate', 'requiredDate', 
        'arrivalDate', 'receivedDate', 'clientId', 'clientName', 'clientTaxId', 
        'itemId', 'itemDescription', 'quantity', 'deliveredQuantity', 'inventory', 
        'inventoryErp', 'priority', 'purchaseType', 'unitSalePrice', 'salePriceCurrency', 
        'requiresCurrency', 'erpOrderNumber', 'erpOrderLine', 'erpEntryNumber', 
        'manualSupplier', 'route', 'shippingMethod', 'status', 'pendingAction', 
        'notes', 'requestedBy', 'approvedBy', 'receivedInWarehouseBy', 
        'lastStatusUpdateBy', 'lastStatusUpdateNotes', 'reopened', 'previousStatus', 
        'lastModifiedBy', 'lastModifiedAt', 'hasBeenModified', 'sourceOrders', 
        'involvedClients', 'analysis'
    ],
    req_history: ['id', 'requestId', 'timestamp', 'status', 'notes', 'updatedBy'],

    // --- CONSIGNMENTS MODULE ---
    cs_agreements: [
        'id', 'client_id', 'client_name', 'erp_warehouse_id', 'next_boleta_number', 
        'notes', 'is_active', 'has_initial_inventory', 'product_code_display_mode', 
        'notification_user_ids', 'operation_mode', 'locked_by', 'locked_by_user_id', 'locked_at'
    ],
    cs_products: ['id', 'agreement_id', 'product_id', 'client_product_code', 'max_stock', 'price'],
    cs_boletas: [
        'id', 'consecutive', 'agreement_id', 'status', 'type', 'created_by', 
        'submitted_by', 'created_at', 'approved_by', 'approved_at', 
        'erp_invoice_number', 'erp_movement_id', 'delivery_date', 'notes', 'previousStatus'
    ],
    cs_boleta_lines: [
        'id', 'boleta_id', 'product_id', 'client_product_code', 'product_description', 
        'counted_quantity', 'replenish_quantity', 'max_stock', 'price', 'is_manually_edited'
    ],
    cs_boleta_history: ['id', 'boleta_id', 'timestamp', 'status', 'notes', 'updatedBy'],
    cs_settings: ['key', 'value'],
    cs_counts: ['id', 'agreement_id', 'product_id', 'quantity', 'counted_at', 'counted_by'],
    cs_closures: [
        'id', 'consecutive', 'agreement_id', 'status', 'is_initial_inventory', 
        'closure_boleta_id', 'physical_count_ref', 'previous_closure_id', 
        'created_at', 'created_by', 'approved_at', 'approved_by', 'notes', 
        'erp_invoice_number', 'invoiced_at'
    ],
    cs_adjustments: ['id', 'agreement_id', 'product_id', 'quantity', 'reason', 'notes', 'created_at', 'created_by'],

    // --- IT TOOLS MODULE ---
    it_notes: ['id', 'title', 'content', 'tags', 'linkedModule', 'createdBy', 'createdAt', 'updatedAt'],
    it_settings: ['key', 'value'],
    it_branches: ['id', 'name', 'code', 'is_active', 'created_at'],
    it_assets: [
        'id', 'item_id', 'category', 'brand', 'model', 'serial_number', 'status', 
        'purchase_date', 'purchase_cost', 'currency', 'exchange_rate', 'warranty_expiration', 
        'invoice_url', 'warranty_cert_url', 'branch_id', 'notes', 'created_at'
    ],
    it_asset_assignments: [
        'id', 'asset_id', 'assignee_type', 'user_id', 'employee_code', 
        'assigned_date', 'returned_date', 'assigned_by'
    ],
    it_licenses_catalog: ['id', 'name', 'description', 'created_at'],
    it_asset_licenses: ['id', 'asset_id', 'license_catalog_id', 'license_key', 'expiration_date', 'status'],
    it_asset_components: ['id', 'parent_asset_id', 'component_name', 'brand', 'model', 'serial_number', 'status'],

    // --- COST ASSISTANT MODULE ---
    cost_drafts: ['id', 'userId', 'name', 'createdAt', 'data'],
    cost_settings: ['key', 'value'],

    // --- FLEET MODULE ---
    fleet_vehicles: [
        'id', 'plate', 'brand', 'model', 'year', 'fuelType', 'loadCapacity', 
        'axes', 'currentMileage', 'lastOilChangeMileage', 'oilChangeInterval', 
        'rtvExpiration', 'photoUrl', 'branchId', 'status',
        'serialNumber', 'vin', 'chassisNumber', 'bodyType', 'traction', 'capacity', 
        'engineNumber', 'engineBrand', 'engineSerial', 'engineModel', 'engineCylinders', 
        'engineDisplacement', 'enginePower', 'engineManufacturer', 'origin', 'ownerName', 'ownerId',
        'odometerUnit', 'lastOilChangeAlertThreshold', 'currentHours', 'color'
    ],
    fleet_fuel_logs: [
        'id', 'vehicleId', 'date', 'mileageBefore', 'liters', 'cost', 
        'driverId', 'fuelTypeId', 'notes', 'createdBy'
    ],
    fleet_maintenance_logs: [
        'id', 'vehicleId', 'date', 'mileage', 'type', 'description', 
        'cost', 'performedBy', 'createdBy', 'ticket_id'
    ],
    fleet_permits: ['id', 'vehicleId', 'type', 'expirationDate', 'documentUrl'],
    fleet_preventative_plans: ['id', 'vehicleId', 'maintenanceType', 'intervalValue', 'intervalUnit', 'lastPerformedValue', 'lastAlertThreshold'],
    fleet_settings: ['id', 'category', 'value', 'price'],
    fleet_fuel_price_history: ['id', 'fuelTypeId', 'price', 'date', 'createdBy'],
    fleet_telegram_bot_states: ['chatId', 'currentFlow', 'step', 'tempData', 'updatedAt'],
    fleet_telegram_linkages: ['id', 'chatId', 'employeeId', 'username', 'activationCode', 'createdAt', 'allowFuel', 'allowMaintenance', 'allowDeliveries', 'allowWarehouse'],
    fleet_deleted_logs_archive: ['id', 'originalId', 'vehicleId', 'logType', 'date', 'amount', 'payload', 'deletedAt', 'deletedBy'],

    // --- NOTIFICATIONS & AUTOMATIONS ---
    notification_rules: ['id', 'name', 'event', 'action', 'recipients', 'subject', 'enabled'],
    notification_templates: ['eventId', 'subject', 'body', 'telegram', 'internal'],
    notification_scheduled_tasks: ['id', 'name', 'schedule', 'taskId', 'lastRun', 'enabled'],
    notification_configs: ['service', 'config'],

    // --- INVENTORY & TICKETS MODULE ---
    inv_departments: ['id', 'name', 'description', 'is_active', 'created_at'],
    inv_items: [
        'id', 'department_id', 'name', 'brand', 'model', 'serial_number', 'part_number', 
        'batch_number', 'category', 'quantity', 'unit', 'location', 'min_stock', 'price', 
        'datasheet_url', 'status', 'is_consumable'
    ],
    inv_ticket_consumables: ['id', 'ticket_id', 'inventory_item_id', 'quantity', 'registered_at'],
    inv_transactions: ['id', 'item_id', 'quantity', 'type', 'reason', 'reference_id', 'created_at', 'created_by'],
    repair_tickets: [
        'id', 'consecutive', 'department_id', 'subject', 'description', 'status', 'priority', 
        'equipment_name', 'brand', 'model', 'serial_number', 'created_at', 'created_by', 
        'assignee_id', 'closed_at', 'closed_by', 'maintenance_type', 'linked_asset_id'
    ],
    ticket_parts: ['id', 'ticket_id', 'item_id', 'quantity', 'price', 'created_at', 'created_by'],
    ticket_settings: ['department_id', 'ticket_prefix', 'next_ticket_number'],
    inv_department_technicians: ['department_id', 'user_id'],
    inv_maintenance_types: ['id', 'department_id', 'name', 'created_at'],
};
