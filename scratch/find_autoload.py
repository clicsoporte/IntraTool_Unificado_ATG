import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'src/app/api/telegram/webhook/route.ts', 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f):
        if "state.currentFlow === 'delivery_menu'" in line:
            print(f"Line {idx+1}: {line.strip()}")
