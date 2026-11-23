package com.scas3052.gullak.capture;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.Telephony;
import androidx.core.content.ContextCompat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Where every captured message goes: bank SMS (live and catch-up), payment-app notifications and shared text.
 * Each is parsed, stored as an unfiled spend (or merged into its twin) and, for live payments, nudged about.
 * Nothing here writes to the money book: the user files each spend in the app.
 */
public final class Capture {

    static final String PREFS = "gullak_capture";
    static final String SOURCE_SMS = "sms";
    static final String SOURCE_GPAY = "gpay";
    static final String SOURCE_PHONEPE = "phonepe";
    static final String SOURCE_PAYTM = "paytm";
    static final String SOURCE_SHARE = "share";
    static final String[] SOURCES = {SOURCE_SMS, SOURCE_GPAY, SOURCE_PHONEPE, SOURCE_PAYTM};

    static final String PKG_GPAY = "com.google.android.apps.nbu.paisa.user";
    static final String PKG_PHONEPE = "com.phonepe.app";
    static final String PKG_PAYTM = "net.one97.paytm";

    static final String PREF_PAUSED = "paused";
    static final String PREF_LAST_SCAN = "last_scan";
    static final String PREF_LOOKBACK_SET = "lookback_set";

    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    private static final long MAX_CATCH_UP_MS = 30 * DAY_MS;
    private static final long SCAN_OVERLAP_MS = 10 * 60 * 1000L;

    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();

    private Capture() {}

    /** Runs capture work off the main thread, one job at a time. */
    static void run(Runnable job) {
        WORK.execute(job);
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean paused(Context context) {
        return prefs(context).getBoolean(PREF_PAUSED, false);
    }

    static boolean sourceOn(Context context, String source) {
        return prefs(context).getBoolean("src_" + source, true);
    }

    /** gpay, phonepe or paytm for the apps Gullak listens to; null for everything else (SMS apps included). */
    static String sourceForPackage(String pkg) {
        if (PKG_GPAY.equals(pkg)) return SOURCE_GPAY;
        if (PKG_PHONEPE.equals(pkg)) return SOURCE_PHONEPE;
        if (PKG_PAYTM.equals(pkg)) return SOURCE_PAYTM;
        return null;
    }

    /** A bank SMS that just arrived. */
    static void onSms(Context context, String sender, String body, long at) {
        if (paused(context) || !sourceOn(context, SOURCE_SMS)) return;
        ParsedPayment parsed = PaymentParser.parseSms(sender, body);
        if (parsed == null) return;
        long now = System.currentTimeMillis();
        SpendStore.Captured captured = SpendStore.get(context).capture(parsed, SOURCE_SMS, sender, body, at, now);
        afterCapture(context, captured, true);
    }

    /** A GPay, PhonePe or Paytm notification. */
    static void onNotification(Context context, String source, String title, String text, long at) {
        if (paused(context) || !sourceOn(context, source)) return;
        ParsedPayment parsed = PaymentParser.parseApp(title, text);
        if (parsed == null) return;
        String raw = (title == null ? "" : title) + "\n" + (text == null ? "" : text);
        long now = System.currentTimeMillis();
        SpendStore.Captured captured = SpendStore.get(context).capture(parsed, source, source, raw.trim(), at, now);
        afterCapture(context, captured, true);
    }

    /** Text shared to Gullak. Returns the spend it became (new or merged), or null when it has no amount. */
    static String onShare(Context context, String text) {
        ParsedPayment parsed = PaymentParser.parseShared(text);
        if (parsed == null) return null;
        long now = System.currentTimeMillis();
        SpendStore.Captured captured = SpendStore.get(context).capture(parsed, SOURCE_SHARE, SOURCE_SHARE, text, now, now);
        if (captured.duplicate) return findRecentShare(context, parsed);
        afterCapture(context, captured, false);
        return captured.spend != null ? captured.spend.id : null;
    }

    private static String findRecentShare(Context context, ParsedPayment parsed) {
        for (SpendStore.Spend s : SpendStore.get(context).list(System.currentTimeMillis())) {
            if (s.amountPaise == parsed.amountPaise && SpendStore.UNFILED.equals(s.status)) return s.id;
        }
        return null;
    }

    /** The user's reply on a payment notification: kept as a note for when Gullak opens. */
    static void onReply(Context context, String spendId, String reply) {
        SpendStore store = SpendStore.get(context);
        if (!store.setHint(spendId, reply, System.currentTimeMillis())) return;
        SpendStore.Spend spend = store.get(spendId);
        if (spend != null && SpendStore.UNFILED.equals(spend.status)) SpendNotifier.show(context, spend, true);
        SpendCapturePlugin.changed();
    }

    /**
     * Reads the SMS inbox for payments missed while Gullak wasn't running. {@code days} picks a first look-back
     * (0 for none); null continues from the last scan. Returns how many new spends it found, or -1 when no
     * look-back has been chosen yet.
     */
    static int scanInbox(Context context, Integer days) {
        SharedPreferences prefs = prefs(context);
        long now = System.currentTimeMillis();
        long since;
        if (days != null) {
            since = now - Math.max(0, Math.min(days, 30)) * DAY_MS;
            prefs.edit().putBoolean(PREF_LOOKBACK_SET, true).apply();
        } else if (!prefs.getBoolean(PREF_LOOKBACK_SET, false)) {
            return -1;
        } else {
            since = Math.max(prefs.getLong(PREF_LAST_SCAN, now) - SCAN_OVERLAP_MS, now - MAX_CATCH_UP_MS);
        }
        SpendStore store = SpendStore.get(context);
        store.prune(now);
        if (paused(context) || !sourceOn(context, SOURCE_SMS)
                || ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            prefs.edit().putLong(PREF_LAST_SCAN, now).apply();
            return 0;
        }
        int added = 0;
        String[] projection = {Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE};
        try (Cursor c = context.getContentResolver().query(Telephony.Sms.Inbox.CONTENT_URI, projection,
                Telephony.Sms.DATE + " > ?", new String[] {Long.toString(since)}, Telephony.Sms.DATE + " ASC")) {
            if (c != null) {
                while (c.moveToNext()) {
                    String sender = c.isNull(0) ? null : c.getString(0);
                    String body = c.isNull(1) ? null : c.getString(1);
                    long at = c.getLong(2);
                    ParsedPayment parsed = PaymentParser.parseSms(sender, body);
                    if (parsed == null) continue;
                    SpendStore.Captured captured = store.capture(parsed, SOURCE_SMS, sender, body, at, now);
                    if (captured.isNew) added++;
                }
            }
        } catch (SecurityException e) {
            // Permission was revoked between the check and the query.
        }
        prefs.edit().putLong(PREF_LAST_SCAN, now).apply();
        if (added > 0) SpendCapturePlugin.changed();
        return added;
    }

    private static void afterCapture(Context context, SpendStore.Captured captured, boolean nudge) {
        if (captured == null || captured.duplicate || captured.spend == null) return;
        if (nudge && SpendStore.UNFILED.equals(captured.spend.status)) SpendNotifier.show(context, captured.spend, !captured.isNew);
        SpendCapturePlugin.changed();
    }
}
