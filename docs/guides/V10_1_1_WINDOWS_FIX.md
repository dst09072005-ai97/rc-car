# V10.1.1 Windows fix

V10.1.0 had a PowerShell quoting bug in `scripts/setup_android.ps1` and used the wrong Godot export-template version directory. V10.1.1 fixes both and makes `check_android.cmd` diagnostic.

Godot 4.7.2 stable templates belong under `%APPDATA%\Godot\export_templates\4.7.2.stable\`.
