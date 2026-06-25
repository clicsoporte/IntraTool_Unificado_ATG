import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'src/app/api/telegram/webhook/route.ts', 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f):
        if "opción no válida" in line.lower() or "opcion no valida" in line.lower() or "por favor elige una opción" in line.lower() or "por favor elige una opcion" in line.lower():
            print(f"Line {idx+1}: {line.strip()}")
