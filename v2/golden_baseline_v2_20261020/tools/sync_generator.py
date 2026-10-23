import os

with open('www/app.js', 'r', encoding='utf-8') as f:
    code = f.read()

with open('tools/generate_v60_app.py', 'r', encoding='utf-8') as f:
    gen = f.read()

start_marker = "code = '''"
prefix = gen[:gen.find(start_marker) + len(start_marker)]
suffix = """'''

with open(TARGET_APP, 'w', encoding='utf-8') as f:
    f.write(code)

print(f"SUCCESS: Written {len(code)} bytes to {TARGET_APP}!")
"""

with open('tools/generate_v60_app.py', 'w', encoding='utf-8') as f:
    f.write(prefix + code + suffix)

print("SUCCESS: Synchronized tools/generate_v60_app.py with current www/app.js!")
