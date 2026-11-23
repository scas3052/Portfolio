package com.scas3052.gullak.capture;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;
import com.scas3052.gullak.MainActivity;

/**
 * "Share to Gullak": for a payment message the parser doesn't know yet. Shared text with an amount becomes an
 * unfiled spend and Gullak opens on it; anything else gets a short note and nothing is saved.
 */
public class ShareActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        CharSequence shared = intent != null ? intent.getCharSequenceExtra(Intent.EXTRA_TEXT) : null;
        String spendId = shared == null ? null : Capture.onShare(getApplicationContext(), shared.toString());
        if (spendId == null) {
            Toast.makeText(this, "Gullak couldn\u2019t find a payment amount in that text.", Toast.LENGTH_LONG).show();
        } else {
            Intent open = new Intent(this, MainActivity.class)
                    .setAction(SpendNotifier.ACTION_OPEN)
                    .putExtra(SpendNotifier.EXTRA_SPEND_ID, spendId)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(open);
        }
        finish();
    }
}
