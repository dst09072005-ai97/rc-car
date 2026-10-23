#!/usr/bin/env python3
"""
tools/serve_webxr.py - Meta Quest 3 WebXR Development Server
Serves the www/ directory over HTTPS (and optional HTTP) for Meta Quest Browser.

Features:
- Auto-generates local self-signed TLS cert with SAN for localhost & host LAN IP
- Sets correct MIME types for .glb, .gltf, .js, .json, .mp4, .png
- Sets WebXR / SharedArrayBuffer / CORS headers:
    Access-Control-Allow-Origin: *
    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Embedder-Policy: require-corp
- Automatic ADB reverse port forwarding (adb reverse tcp:8080 tcp:8080)
- Dual mode: HTTP on 8080 (for ADB reverse localhost) & HTTPS on 8443 (for LAN Wi-Fi)
"""

import os
import sys
import socket
import datetime
import ipaddress
import threading
import subprocess
import mimetypes
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import ssl

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WWW_DIR = os.path.join(ROOT_DIR, "www")
TOOLS_DIR = os.path.join(ROOT_DIR, "tools")

CERT_PATH = os.path.join(TOOLS_DIR, "cert.pem")
KEY_PATH = os.path.join(TOOLS_DIR, "key.pem")

# Ensure critical MIME types
mimetypes.add_type("model/gltf-binary", ".glb")
mimetypes.add_type("model/gltf+json", ".gltf")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("video/mp4", ".mp4")


def get_lan_ip():
    """Detect LAN IP address of the primary network interface."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def generate_self_signed_cert(lan_ip):
    """Generate self-signed TLS certificate with SAN for localhost, 127.0.0.1, and LAN IP."""
    if os.path.exists(CERT_PATH) and os.path.exists(KEY_PATH):
        return CERT_PATH, KEY_PATH

    print("[TLS] Generating self-signed TLS certificate...")
    os.makedirs(TOOLS_DIR, exist_ok=True)

    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, u"RollsRoyceWebXR"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"XE_RC_FPV_V10")
        ])

        san_list = [
            x509.DNSName(u"localhost"),
            x509.IPAddress(ipaddress.IPv4Address("127.0.0.1"))
        ]
        try:
            san_list.append(x509.IPAddress(ipaddress.IPv4Address(lan_ip)))
        except Exception:
            pass

        san = x509.SubjectAlternativeName(san_list)

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
            .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
            .add_extension(san, critical=False)
            .sign(key, hashes.SHA256())
        )

        with open(KEY_PATH, "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))

        with open(CERT_PATH, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        print(f"[TLS] Certificate saved: {CERT_PATH}")
        return CERT_PATH, KEY_PATH
    except Exception as e:
        print(f"[TLS ERROR] Could not generate certificate: {e}")
        return None, None


class WebXRRequestHandler(SimpleHTTPRequestHandler):
    """Custom HTTP request handler with WebXR & CORS headers."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WWW_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionResetError, BrokenPipeError):
            pass

    def log_message(self, format, *args):
        # Keep logs clean
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")


def setup_adb_reverse():
    """Attempt to configure adb reverse port forwarding for Meta Quest."""
    try:
        res = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=3)
        lines = [line.strip() for line in res.stdout.strip().splitlines() if line.strip() and not line.startswith("List")]
        devices = [l for l in lines if "\tdevice" in l]
        if devices:
            print(f"[ADB] Found {len(devices)} connected device(s): {devices}")
            subprocess.run(["adb", "reverse", "tcp:8080", "tcp:8080"], check=False)
            subprocess.run(["adb", "reverse", "tcp:8443", "tcp:8443"], check=False)
            print("[ADB] Reverse port forwarding active: tcp:8080 -> tcp:8080, tcp:8443 -> tcp:8443")
        else:
            print("[ADB] No physical device detected currently. (adb reverse skipped)")
    except Exception as e:
        print(f"[ADB NOTE] adb command not run: {e}")


def run_http_server(port=8080):
    server = ThreadingHTTPServer(("0.0.0.0", port), WebXRRequestHandler)
    print(f"[HTTP] Listening on http://0.0.0.0:{port} (directory: {WWW_DIR})")
    server.serve_forever()


def run_https_server(port=8443, certfile=None, keyfile=None):
    if not certfile or not keyfile:
        print("[HTTPS] No certificate available. HTTPS server not started.")
        return
    server = ThreadingHTTPServer(("0.0.0.0", port), WebXRRequestHandler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=certfile, keyfile=keyfile)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f"[HTTPS] Listening on https://0.0.0.0:{port} (directory: {WWW_DIR})")
    server.serve_forever()


def main():
    lan_ip = get_lan_ip()
    cert_path, key_path = generate_self_signed_cert(lan_ip)
    setup_adb_reverse()

    print("=" * 72)
    print("  ROLLS-ROYCE VR - META QUEST 3 WEBXR DEVELOPMENT SERVER")
    print("=" * 72)
    print(f"  Root Directory  : {WWW_DIR}")
    print(f"  Local Host IP   : {lan_ip}")
    print("-" * 72)
    print("  1. METHOD A (Recommended - USB / ADB reverse):")
    print("     Run command on PC : adb reverse tcp:8080 tcp:8080")
    print("     In Quest Browser  : http://localhost:8080")
    print("     Note              : 'localhost' is treated as SECURE CONTEXT by Chromium.")
    print("                         Zero certificate errors, full 90 FPS 6DoF WebXR!")
    print("-" * 72)
    print("  2. METHOD B (Wi-Fi Wireless):")
    print(f"     In Quest Browser  : https://{lan_ip}:8443")
    print("     Note              : Accept the self-signed certificate once (Advanced -> Proceed).")
    print("=" * 72)
    print("Press Ctrl+C to terminate the server.\n")

    # Start HTTP in daemon thread
    http_thread = threading.Thread(target=run_http_server, args=(8080,), daemon=True)
    http_thread.start()

    # Run HTTPS in main thread (or wait)
    if cert_path and key_path:
        try:
            run_https_server(8443, cert_path, key_path)
        except KeyboardInterrupt:
            print("\n[SERVER] Server stopped by user.")
    else:
        try:
            http_thread.join()
        except KeyboardInterrupt:
            print("\n[SERVER] Server stopped by user.")


if __name__ == "__main__":
    main()
