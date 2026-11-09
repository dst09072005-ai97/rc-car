package com.luxuryvr.rollsroyce.quest3;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        setupVrBridge();
    }
    private boolean isVrBridgeRegistered = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupVrBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupVrBridge();
    }

    private void setupVrBridge() {
        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

            if (!isVrBridgeRegistered) {
                webView.addJavascriptInterface(new QuestVRNativeBridge(), "QuestVRBridge");
                isVrBridgeRegistered = true;
            }
        }
    }

    public class QuestVRNativeBridge {
        @JavascriptInterface
        public void launchQuestVR(final String vrUrl) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(vrUrl));
                        intent.setPackage("com.oculus.browser");
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        try {
                            Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(vrUrl));
                            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(fallback);
                        } catch (Exception ex) {
                            Toast.makeText(MainActivity.this, "Lỗi kích hoạt VR: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public String getDefaultHostIp() {
            return "192.168.1.76";
        }

        @JavascriptInterface
        public String getDeviceIp() {
            try {
                java.util.List<java.net.NetworkInterface> interfaces = java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces());
                for (java.net.NetworkInterface intf : interfaces) {
                    java.util.List<java.net.InetAddress> addrs = java.util.Collections.list(intf.getInetAddresses());
                    for (java.net.InetAddress addr : addrs) {
                        if (!addr.isLoopbackAddress() && addr instanceof java.net.Inet4Address) {
                            return addr.getHostAddress();
                        }
                    }
                }
            } catch (Exception e) {}
            return "";
        }

        @JavascriptInterface
        public String getDeviceSubnet() {
            String ip = getDeviceIp();
            if (ip != null && ip.contains(".")) {
                int lastDot = ip.lastIndexOf('.');
                return ip.substring(0, lastDot);
            }
            return "";
        }
    }
}
