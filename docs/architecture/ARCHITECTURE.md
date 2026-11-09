# V10 Architecture

## Control plane

```text
Godot desktop
   |
   | UDP 4 bytes @ 100 Hz
   v
ESP32-CAR 192.168.4.1:4210
   |
   +-- failsafe 500 ms
```

## Video plane — direct mode

```text
ESP32-CAM 192.168.4.102:4212
   |
   | UDP fragments [frame_id, chunk_index, chunk_total, JPEG...]
   v
Godot
   |
   +-- TextureRect (desktop)
   +-- QuadMesh in XROrigin world (OpenXR)
```

## Video plane — relay mode

```text
ESP32-CAM
  |
  | one UDP stream
  v
Node relay :4212
  |
  +-- MJPEG /stream
  +-- WebSocket /ws
  +-- QR /api/qr
       |
       +-- browser
       +-- Quest Browser/WebXR
       +-- Godot Android/OpenXR
```

The relay uses latest-frame fan-out. Slow viewers do not create an unbounded frame queue.

## Threat boundaries

Public viewers:
- view only;
- no UDP control socket;
- optional `VIEW_TOKEN`;
- remote transport expected to be HTTPS/WSS.

Vehicle control:
- remains local UDP in V0;
- failsafe remains inside ESP32.

## Why not true stereo yet?

A mono camera has no interocular baseline. Rendering the same source twice gives VR presentation, not binocular parallax. The correct next step is L/R capture synchronization.
