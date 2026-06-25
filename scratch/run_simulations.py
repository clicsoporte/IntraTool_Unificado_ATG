import json
import sqlite3
import os
import urllib.request
import time
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

db_path = os.path.join(os.getcwd(), 'dbs', 'clic_tools.db')
webhook_url = "http://localhost:9004/api/telegram/webhook"
log_path = os.path.join(os.getcwd(), 'telegram_sim_log.txt')

CHAT_ID = 14309200
DRIVER_EMPLOYEE_ID = "0224"

def db_conn():
    return sqlite3.connect(db_path)

def clear_logs():
    if os.path.exists(log_path):
        os.remove(log_path)

def read_logs():
    if not os.path.exists(log_path):
        return []
    with open(log_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    logs = []
    for line in lines:
        if line.strip():
            logs.append(json.loads(line))
    return logs

def send_update(payload):
    req = urllib.request.Request(
        webhook_url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode('utf-8'))
    except Exception as e:
        # print(f"Error sending webhook: {e}")
        return None

def send_text(text):
    payload = {
        "update_id": 10000 + int(time.time() % 10000),
        "message": {
            "chat": {"id": CHAT_ID},
            "from": {"first_name": "Alexis", "username": "JonaUG"},
            "text": text
        }
    }
    send_update(payload)
    time.sleep(0.3)

def send_location(lat, lng):
    payload = {
        "update_id": 10000 + int(time.time() % 10000),
        "message": {
            "chat": {"id": CHAT_ID},
            "from": {"first_name": "Alexis", "username": "JonaUG"},
            "location": {"latitude": lat, "longitude": lng}
        }
    }
    send_update(payload)
    time.sleep(0.3)

def reset_db_state():
    conn = db_conn()
    c = conn.cursor()
    
    # Clean assignments, queue, and logs
    c.execute("DELETE FROM ops_delivery_assignments")
    c.execute("DELETE FROM ops_delivery_queue")
    c.execute("DELETE FROM core_erp_invoice_headers")
    c.execute("DELETE FROM fleet_telegram_bot_states WHERE chatId = ?", (str(CHAT_ID),))
    
    # Ensure settings are set to mandatory for strict testing
    c.execute("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('bot_ask_start_location', 'mandatory')")
    c.execute("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('bot_ask_first_client', 'mandatory')")
    c.execute("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('bot_ask_return_location', 'mandatory')")
    c.execute("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('bot_ask_arrival_location', 'mandatory')")
    c.execute("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('bot_require_evidence_photo', 'disabled')")
    c.execute("INSERT OR REPLACE INTO ops_delivery_settings (key, value) VALUES ('bot_require_invoice_photo', 'disabled')")

    conn.commit()
    conn.close()

def print_simulation_messages(title):
    print("\n" + "="*80)
    print(f" SIMULACIÓN: {title}")
    print("="*80)
    logs = read_logs()
    for log in logs:
        text_clean = log.get('text', '').replace('\n', ' ')
        print(f"Bot -> {text_clean[:130]}")
    clear_logs()

# ----------------- SIMULATIONS -----------------

def run_simulation_1():
    # 1. HAPPY PATH DELIVERY (Inicio -> Salida -> Entrega Completa -> Retorno -> Cierre)
    reset_db_state()
    clear_logs()
    
    # Add ERP invoice
    conn = db_conn()
    c = conn.cursor()
    c.execute("INSERT INTO core_erp_invoice_headers (FACTURA, CLIENTE, NOMBRE_CLIENTE, ANULADA, RUTA) VALUES ('FAC-001', 'C-001', 'Cliente Uno', 'N', 'Alajuela')")
    conn.commit()
    conn.close()

    print("Running Sim 1...")
    send_text("🚛 Transportes y Entregas")
    send_text("🛣️ Iniciar Nueva Ruta")
    send_text("6") # Alajuela
    send_text("C-154741")
    send_text("🚀 Salir a Ruta")
    
    # Start location
    send_location(9.9281, -84.0907)
    
    # First client selection (since FAC-001 was imported for Cliente Uno)
    send_text("Cliente Uno")
    
    # Register Delivery
    send_text("📝 Registrar Entrega")
    send_text("FAC-001") # type document number
    send_text("Sí, registrar ✅") # Confirm
    send_text("👍 Entregado Completo")
    
    # Finish / Return
    send_text("🏁 Finalizar Ruta")
    send_text("🚀 Completar Ruta y regresar")
    send_location(9.9285, -84.0910) # Return location
    
    # Arrival
    send_text("🏁 Registrar Llegada a Empresa")
    send_location(9.9300, -84.0920) # Arrival location
    
    print_simulation_messages("HAPPY PATH DELIVERY COMPLETE")

def run_simulation_2():
    # 2. PARTIAL/REJECTED DELIVERY WITH RETURN SUMMARY
    reset_db_state()
    clear_logs()
    
    conn = db_conn()
    c = conn.cursor()
    c.execute("INSERT INTO core_erp_invoice_headers (FACTURA, CLIENTE, NOMBRE_CLIENTE, ANULADA, RUTA) VALUES ('FAC-002', 'C-002', 'Cliente Dos', 'N', 'Alajuela')")
    conn.commit()
    conn.close()

    print("Running Sim 2...")
    send_text("Consultar RTV") # This is not relevant, it's a menu but we just want to start the flow
    send_text("🚛 Transportes y Entregas")
    send_text("🛣️ Iniciar Nueva Ruta")
    send_text("6")
    send_text("C-154741")
    send_text("🚀 Salir a Ruta")
    send_location(9.9281, -84.0907)
    send_text("Cliente Dos")
    
    # Try delivery but report partial / reject
    send_text("📝 Registrar Entrega")
    send_text("FAC-002")
    send_text("Sí, registrar ✅")
    send_text("❌ Rechazado por Cliente")
    send_text("Cliente no tenía dinero") # Comment
    send_text("Omitir foto ⏭️")
    
    # Finish / Return
    send_text("🏁 Finalizar Ruta")
    send_text("🚀 Completar Ruta y regresar")
    send_location(9.9285, -84.0910)
    
    # Arrival
    send_text("🏁 Registrar Llegada a Empresa")
    send_location(9.9300, -84.0920)
    
    print_simulation_messages("REJECTED DELIVERY WITH PENDING SUMMARY")

def run_simulation_3():
    # 3. HAPPY PATH COLLECT (Notificación -> Retiro Exitoso -> Retorno -> Cierre)
    reset_db_state()
    clear_logs()
    
    print("Running Sim 3...")
    send_text("🚛 Transportes y Entregas")
    send_text("🛣️ Iniciar Nueva Ruta")
    send_text("6")
    send_text("C-154741")
    send_text("🚀 Salir a Ruta")
    send_location(9.9281, -84.0907)
    send_text("Omitir primer cliente ⏭️")
    
    # Add a mock pending collect request in database
    conn = db_conn()
    c = conn.cursor()
    c.execute("INSERT INTO ops_delivery_queue (documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por, estado, entregado, comentario, fecha_registro) VALUES ('REC-003', 'recoger', 'PROV-003', 'Proveedor Tres', 'coordinador', 'pendiente', 0, '{\"solicitante_email\":\"tecnologia@industriasgarend.com\"}', '2026-06-19T00:00:00.000Z')")
    conn.commit()
    conn.close()

    # Claim/Self-assign collect request
    send_text("/doc_REC-003")
    send_text("Sí, registrar ✅") # Confirm claiming
    send_text("👍 Recogido")
    send_text("Todo recibido en orden") # driver comment
    send_text("Omitir foto ⏭️") # photo
    
    # Finish / Return
    send_text("🏁 Finalizar Ruta")
    send_text("🚀 Completar Ruta y regresar")
    send_location(9.9285, -84.0910)
    send_text("🏁 Registrar Llegada a Empresa")
    send_location(9.9300, -84.0920)
    
    print_simulation_messages("HAPPY PATH COLLECT")

def run_simulation_4():
    # 4. FAILED COLLECT WITH PENDING SUMMARY
    reset_db_state()
    clear_logs()
    
    print("Running Sim 4...")
    send_text("🚛 Transportes y Entregas")
    send_text("🛣️ Iniciar Nueva Ruta")
    send_text("6")
    send_text("C-154741")
    send_text("🚀 Salir a Ruta")
    send_location(9.9281, -84.0907)
    send_text("Omitir primer cliente ⏭️")
    
    conn = db_conn()
    c = conn.cursor()
    c.execute("INSERT INTO ops_delivery_queue (documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por, estado, entregado, comentario, fecha_registro) VALUES ('REC-004', 'recoger', 'PROV-004', 'Proveedor Cuatro', 'coordinador', 'pendiente', 0, '{\"solicitante_email\":\"tecnologia@industriasgarend.com\"}', '2026-06-19T00:00:00.000Z')")
    conn.commit()
    conn.close()

    # Claim
    send_text("/doc_REC-004")
    send_text("Sí, registrar ✅")
    send_text("❌ No se pudo Recoger")
    send_text("Proveedor cerrado por feriado")
    send_text("Omitir foto ⏭️")
    
    # Return
    send_text("🏁 Finalizar Ruta")
    send_text("🚀 Completar Ruta y regresar")
    send_location(9.9285, -84.0910)
    
    # Arrival
    send_text("🏁 Registrar Llegada a Empresa")
    send_location(9.9300, -84.0920)
    
    print_simulation_messages("FAILED COLLECT WITH SUMMARY")

def run_simulation_5():
    # 5. MIXED FLOW (1 Delivery Exitosa, 1 Recolecta Exitosa)
    reset_db_state()
    clear_logs()
    
    conn = db_conn()
    c = conn.cursor()
    c.execute("INSERT INTO core_erp_invoice_headers (FACTURA, CLIENTE, NOMBRE_CLIENTE, ANULADA, RUTA) VALUES ('FAC-005', 'C-005', 'Cliente Cinco', 'N', 'Alajuela')")
    c.execute("INSERT INTO ops_delivery_queue (documento_numero, tipo_documento, cliente_id, cliente_nombre, creado_por, estado, entregado, comentario, fecha_registro) VALUES ('REC-005', 'recoger', 'PROV-005', 'Proveedor Cinco', 'coordinador', 'pendiente', 0, '{\"solicitante_email\":\"tecnologia@industriasgarend.com\"}', '2026-06-19T00:00:00.000Z')")
    conn.commit()
    conn.close()

    print("Running Sim 5...")
    send_text("🚛 Transportes y Entregas")
    send_text("🛣️ Iniciar Nueva Ruta")
    send_text("6")
    send_text("C-154741")
    send_text("🚀 Salir a Ruta")
    send_location(9.9281, -84.0907)
    send_text("Cliente Cinco")
    
    # Do delivery
    send_text("📝 Registrar Entrega")
    send_text("FAC-005")
    send_text("Sí, registrar ✅")
    send_text("👍 Entregado Completo")
    
    # Do collect
    send_text("/doc_REC-005")
    send_text("Sí, registrar ✅")
    send_text("👍 Recogido")
    send_text("Recogido y cargado")
    send_text("Omitir foto ⏭️")
    
    # Return
    send_text("🏁 Finalizar Ruta")
    send_text("🚀 Completar Ruta y regresar")
    send_location(9.9285, -84.0910)
    
    # Arrival
    send_text("🏁 Registrar Llegada a Empresa")
    send_location(9.9300, -84.0920)
    
    print_simulation_messages("MIXED FLOW (DELIVERY & COLLECT SUCCESS)")

def run_simulation_6():
    # 6. GEOLOCATION LOCK (Omitir ubicación es rechazado en modo obligatorio)
    reset_db_state()
    clear_logs()
    
    conn = db_conn()
    c = conn.cursor()
    c.execute("INSERT INTO core_erp_invoice_headers (FACTURA, CLIENTE, NOMBRE_CLIENTE, ANULADA, RUTA) VALUES ('FAC-006', 'C-006', 'Cliente Seis', 'N', 'Alajuela')")
    conn.commit()
    conn.close()

    print("Running Sim 6...")
    send_text("🚛 Transportes y Entregas")
    send_text("🛣️ Iniciar Nueva Ruta")
    send_text("6")
    send_text("C-154741")
    
    # Attempt to start route but try to skip start location
    send_text("🚀 Salir a Ruta")
    send_text("Omitir ubicación ⏭️") # Should reject
    
    # Send location now
    send_location(9.9281, -84.0907)
    send_text("Cliente Seis")
    
    # Register delivery
    send_text("📝 Registrar Entrega")
    send_text("FAC-006")
    send_text("Sí, registrar ✅")
    send_text("👍 Entregado Completo")
    
    # Attempt to skip return location
    send_text("🏁 Finalizar Ruta")
    send_text("🚀 Completar Ruta y regresar")
    send_text("Omitir ubicación ⏭️") # Should reject
    
    # Send return location
    send_location(9.9285, -84.0910)
    
    # Attempt to skip arrival location
    send_text("🏁 Registrar Llegada a Empresa")
    send_text("Omitir ubicación ⏭️") # Should reject
    
    # Send arrival location
    send_location(9.9300, -84.0920)
    
    print_simulation_messages("GEOLOCATION MANDATORY BLOCKING")

if __name__ == "__main__":
    run_simulation_1()
    run_simulation_2()
    run_simulation_3()
    run_simulation_4()
    run_simulation_5()
    run_simulation_6()
