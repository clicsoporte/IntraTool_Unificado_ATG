const db = require('better-sqlite3')('dbs/clic_tools.db');
const res = db.prepare(`
  SELECT FACTURA FROM core_erp_invoice_headers WHERE FACTURA LIKE '%4705'
`).all();
console.log(res);
