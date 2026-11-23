package com.scas3052.gullak;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.scas3052.gullak.capture.SpendCapturePlugin;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        // Draw behind the system bars on every Android version; the web layer pads itself with
        // env(safe-area-inset-*), which Capacitor's System Bars handling keeps correct.
        EdgeToEdge.enable(this);
        registerPlugin(SpendCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
