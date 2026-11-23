package com.scas3052.gullak.capture;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Catches bank SMS as they arrive, even when Gullak is closed. Anything this misses (a phone that kills
 * background apps) is picked up by the catch-up scan the next time Gullak opens.
 */
public class SmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;

        // A long message arrives in parts; join them per sender.
        final Map<String, StringBuilder> bodies = new LinkedHashMap<>();
        for (SmsMessage part : parts) {
            if (part == null) continue;
            String from = part.getDisplayOriginatingAddress();
            String body = part.getDisplayMessageBody();
            StringBuilder sb = bodies.get(from);
            if (sb == null) {
                sb = new StringBuilder();
                bodies.put(from, sb);
            }
            if (body != null) sb.append(body);
        }

        final Context app = context.getApplicationContext();
        final long now = System.currentTimeMillis();
        final PendingResult pending = goAsync();
        Capture.run(() -> {
            try {
                for (Map.Entry<String, StringBuilder> entry : bodies.entrySet()) {
                    Capture.onSms(app, entry.getKey(), entry.getValue().toString(), now);
                }
            } finally {
                pending.finish();
            }
        });
    }
}
