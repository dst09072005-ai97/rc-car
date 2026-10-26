---
name: xe-rc-fpv-v10
description: Build and debug the XE RC FPV V10 stack without breaking the V0 golden baseline.
---

# Rules

1. Treat `v0_baseline/` as immutable evidence.
2. Prefer small adapters over firmware rewrites.
3. Keep control-plane and video-plane separate.
4. Public viewers are read-only.
5. For VR, distinguish mono presentation from true stereo depth.
6. Measure latest-frame latency and drops before changing codec/protocol.
7. When behavior is unknown, instrument it rather than inventing semantics.
