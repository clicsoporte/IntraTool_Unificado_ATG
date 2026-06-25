import sqlite3
import os

db_path = os.path.join(os.getcwd(), 'dbs', 'clic_tools.db')
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("SELECT * FROM ops_delivery_assignments WHERE empleado_id = 19")
rows = c.fetchall()
print("Assignments for 19 count:", len(rows))
for r in rows:
    print(r)

conn.close()
