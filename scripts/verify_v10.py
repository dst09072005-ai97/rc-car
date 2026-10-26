import os, sys, re, json
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
required=[
 "v0_baseline/esp32cam/esp32cam.ino",
 "v0_baseline/esp32car/esp32car.ino",
 "controller_godot/project.godot",
 "controller_godot/export_presets.cfg",
 "controller_godot/scenes/main.tscn",
 "controller_godot/scripts/rc_fpv_v10.gd",
 "server/package.json",
 "server/server.js",
 "server/public/index.html",
 "server/public/app.js",
]
missing=[p for p in required if not os.path.exists(os.path.join(ROOT,p))]
if missing:
    print("[FAIL] missing:", *missing, sep="\n")
    sys.exit(1)
for forbidden in [".env","node_modules",".pio",".godot","build"]:
    p=os.path.join(ROOT,forbidden)
    if os.path.exists(p):
        print("[FAIL] release artifact present:", forbidden)
        sys.exit(1)
src=open(os.path.join(ROOT,"controller_godot/scripts/rc_fpv_v10.gd"),encoding="utf-8").read()
for t in ["OpenXR","WebSocketPeer","PacketPeerUDP","XROrigin3D","XRCamera3D"]:
    assert t in src, t
server=open(os.path.join(ROOT,"server/server.js"),encoding="utf-8").read()
for t in ["4212","HELLO","/stream","/ws","MAX_FRAME_BYTES"]:
    assert t in server, t
print("[PASS] V10 source-release verification")
