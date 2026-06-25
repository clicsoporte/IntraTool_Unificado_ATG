import sqlite3
import os

db_path = os.path.join(os.getcwd(), 'dbs', 'clic_tools.db')
conn = sqlite3.connect(db_path)
c = conn.cursor()

print("--- Linkages ---")
c.execute("SELECT * FROM fleet_telegram_linkages")
for row in c.fetchall():
    print(row)

print("--- Active User 0224 ---")
c.execute("SELECT id, name, employeeId FROM core_users WHERE employeeId = '0224'")
print(c.fetchall())

print("--- Active Vehicles ---")
c.execute("SELECT id, plate, brand, model FROM fleet_vehicles LIMIT 5")
print(c.fetchall())

conn.close()
