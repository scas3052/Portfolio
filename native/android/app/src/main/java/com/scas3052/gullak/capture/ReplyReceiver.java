package com.scas3052.gullak.capture;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.RemoteInput;

/** Receives the Reply typed on a payment notification ("dinner, split with Ravi") and keeps it as a note. */
public class ReplyReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !SpendNotifier.ACTION_REPLY.equals(intent.getAction())) return;
        String spendId = intent.getStringExtra(SpendNotifier.EXTRA_SPEND_ID);
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence reply = results != null ? results.getCharSequence(SpendNotifier.KEY_REPLY) : null;
        if (spendId == null || reply == null) return;
        final Context app = context.getApplicationContext();
        final String note = reply.toString();
        final PendingResult pending = goAsync();
        Capture.run(() -> {
            try {
                Capture.onReply(app, spendId, note);
            } finally {
                pending.finish();
            }
        });
    }
}
