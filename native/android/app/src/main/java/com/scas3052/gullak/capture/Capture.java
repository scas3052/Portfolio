package com.scas3052.gullak.capture;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.Telephony;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Where every captured message goes: bank SMS (live and catch-up), payment-app notifications, bank emails (read from
 * the mail app's notification) and shared text. Each is parsed, stored as an unfiled spend (or merged into its twin)
 * and, for live payments, nudged about. Nothing here writes to the money book: the user files each spend in the app.
 */
public final class Capture {

    static final String PREFS = "gullak_capture";
    static final String SOURCE_SMS = "sms";
    static final String SOURCE_SHARE = "share";
    static final String SOURCE_MAIL = "mail";
    static final String SOURCE_STATEMENT = "statement";

    static final String PREF_PAUSED = "paused";
    static final String PREF_LAST_SCAN = "last_scan";
    static final String PREF_LOOKBACK_SET = "lookback_set";
    /** Apps the user added in Settings, as a JSON array of {package, label}. */
    static final String PREF_ADDED_APPS = "added_apps";
    /** Package names (never text) of apps that posted notifications lately, for Settings → Add app. */
    static final String PREF_SEEN_APPS = "seen_apps";
    /** Bank email senders to read (Settings → Bank emails), a JSON array of names. Unset means slice only. */
    static final String PREF_MAIL_SENDERS = "mail_senders";
    /** The last email from a listed sender: who sent it, when, and whether it was a payment (never what it said). */
    static final String PREF_MAIL_LAST = "mail_last";

    private static final long SEEN_EVERY_MS = 6 * 60 * 60 * 1000L;
    private static final long SEEN_KEEP_MS = 30L * 24 * 60 * 60 * 1000;
    private static final int SEEN_MAX = 80;

    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    private static final long MAX_CATCH_UP_MS = 30 * DAY_MS;
    private static final long SCAN_OVERLAP_MS = 10 * 60 * 1000L;

    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();
    private static volatile Map<String, String> addedCache;
    private static volatile List<String> mailCache;
    private static final Map<String, Long> seenRecently = new ConcurrentHashMap<>();

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

    /**
     * The source name for a notification from {@code pkg}: a built-in app's short name ("gpay", "slice"), the package
     * name of an app the user added, or null for everything else (SMS apps included), which then isn't read.
     */
    static String sourceForPackage(Context context, String pkg) {
        return PaymentApps.sourceFor(pkg, addedApps(context).keySet());
    }

    /** Every source the user can switch on and off: bank SMS, bank emails, the built-in apps and the apps they added. */
    static List<String> sourceIds(Context context) {
        List<String> ids = new ArrayList<>();
        ids.add(SOURCE_SMS);
        ids.add(SOURCE_MAIL);
        for (PaymentApps.App app : PaymentApps.BUILT_IN) ids.add(app.source);
        ids.addAll(addedApps(context).keySet());
        return ids;
    }

    /** package → label for the apps the user added, in the order they were added. Cached: every notification asks. */
    static Map<String, String> addedApps(Context context) {
        Map<String, String> cached = addedCache;
        if (cached != null) return cached;
        Map<String, String> apps = new LinkedHashMap<>();
        try {
            JSONArray list = new JSONArray(prefs(context).getString(PREF_ADDED_APPS, "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject app = list.optJSONObject(i);
                String pkg = app == null ? null : app.optString("package", "");
                if (pkg != null && !pkg.isEmpty()) apps.put(pkg, app.optString("label", pkg));
            }
        } catch (JSONException e) {
            // Unreadable list: start again with none.
        }
        addedCache = Collections.unmodifiableMap(apps);
        return addedCache;
    }

    private static synchronized void saveAddedApps(Context context, Map<String, String> apps) {
        JSONArray list = new JSONArray();
        for (Map.Entry<String, String> entry : apps.entrySet()) {
            JSONObject app = new JSONObject();
            try {
                app.put("package", entry.getKey());
                app.put("label", entry.getValue());
            } catch (JSONException e) {
                continue;
            }
            list.put(app);
        }
        prefs(context).edit().putString(PREF_ADDED_APPS, list.toString()).apply();
        addedCache = Collections.unmodifiableMap(new LinkedHashMap<>(apps));
    }

    /** Starts reading payment notifications from {@code pkg} (Settings → Add app). */
    static synchronized void addApp(Context context, String pkg, String label) {
        Map<String, String> apps = new LinkedHashMap<>(addedApps(context));
        String name = label == null || label.trim().isEmpty() ? pkg : label.trim();
        apps.put(pkg, name.length() > 40 ? name.substring(0, 40) : name);
        saveAddedApps(context, apps);
    }

    /** Stops reading {@code pkg}. Payments already caught from it stay. */
    static synchronized void removeApp(Context context, String pkg) {
        Map<String, String> apps = new LinkedHashMap<>(addedApps(context));
        if (apps.remove(pkg) == null) return;
        saveAddedApps(context, apps);
        prefs(context).edit().remove("src_" + pkg).apply();
    }

    /** The bank email senders Gullak reads, in the order they were added. Cached: every mail notification asks. */
    static List<String> mailSenders(Context context) {
        List<String> cached = mailCache;
        if (cached != null) return cached;
        List<String> senders = new ArrayList<>();
        String saved = prefs(context).getString(PREF_MAIL_SENDERS, null);
        if (saved == null) {
            Collections.addAll(senders, MailSenders.DEFAULT);
        } else {
            try {
                JSONArray list = new JSONArray(saved);
                for (int i = 0; i < list.length(); i++) {
                    String name = MailSenders.clean(list.optString(i, ""));
                    if (name != null) senders.add(name);
                }
            } catch (JSONException e) {
                Collections.addAll(senders, MailSenders.DEFAULT);
            }
        }
        mailCache = Collections.unmodifiableList(senders);
        return mailCache;
    }

    private static void saveMailSenders(Context context, List<String> senders) {
        JSONArray list = new JSONArray();
        for (String sender : senders) list.put(sender);
        prefs(context).edit().putString(PREF_MAIL_SENDERS, list.toString()).apply();
        mailCache = Collections.unmodifiableList(new ArrayList<>(senders));
    }

    /** Starts reading payment emails from {@code name} (already tidied). False only when the list is full. */
    static synchronized boolean addMailSender(Context context, String name) {
        List<String> senders = new ArrayList<>(mailSenders(context));
        for (String sender : senders) {
            if (MailSenders.same(sender, name)) return true;
        }
        if (senders.size() >= MailSenders.MAX_SENDERS) return false;
        senders.add(name);
        saveMailSenders(context, senders);
        return true;
    }

    /** Stops reading emails from {@code name}. Payments already caught from them stay. */
    static synchronized void removeMailSender(Context context, String name) {
        List<String> senders = new ArrayList<>(mailSenders(context));
        boolean removed = false;
        Iterator<String> it = senders.iterator();
        while (it.hasNext()) {
            if (MailSenders.same(it.next(), name)) {
                it.remove();
                removed = true;
            }
        }
        if (removed) saveMailSenders(context, senders);
    }

    /** The last email from a listed sender as {sender, at, payment}, or null before the first one. */
    static JSONObject lastMail(Context context) {
        String saved = prefs(context).getString(PREF_MAIL_LAST, null);
        if (saved == null) return null;
        try {
            return new JSONObject(saved);
        } catch (JSONException e) {
            return null;
        }
    }

    /**
     * Remembers that {@code pkg} posted a notification (its name only, nothing it said), at most every few hours per
     * app, so Settings → Add app can list the apps that actually notify first.
     */
    static void noteSeen(Context context, String pkg, long at) {
        if (pkg == null || pkg.equals(context.getPackageName())) return;
        Long last = seenRecently.get(pkg);
        if (last != null && at - last < SEEN_EVERY_MS) return;
        seenRecently.put(pkg, at);
        run(() -> {
            Map<String, Long> seen = new LinkedHashMap<>(seenApps(context));
            seen.remove(pkg);
            seen.put(pkg, at);
            Iterator<Map.Entry<String, Long>> it = seen.entrySet().iterator();
            while (it.hasNext()) {
                Map.Entry<String, Long> oldest = it.next();
                if (seen.size() > SEEN_MAX || oldest.getValue() < at - SEEN_KEEP_MS) it.remove();
                else break;
            }
            JSONObject json = new JSONObject();
            try {
                for (Map.Entry<String, Long> entry : seen.entrySet()) json.put(entry.getKey(), (long) entry.getValue());
            } catch (JSONException e) {
                return;
            }
            prefs(context).edit().putString(PREF_SEEN_APPS, json.toString()).apply();
        });
    }

    /** package → when it last posted a notification, oldest first. */
    static Map<String, Long> seenApps(Context context) {
        Map<String, Long> seen = new LinkedHashMap<>();
        try {
            JSONObject json = new JSONObject(prefs(context).getString(PREF_SEEN_APPS, "{}"));
            Iterator<String> keys = json.keys();
            while (keys.hasNext()) {
                String pkg = keys.next();
                seen.put(pkg, json.optLong(pkg, 0));
            }
        } catch (JSONException e) {
            // Unreadable: start again.
        }
        return seen;
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

    /** A notification from one of the apps Gullak reads (built in, or added by the user). */
    static void onNotification(Context context, String source, String title, String text, long at) {
        if (paused(context) || !sourceOn(context, source)) return;
        ParsedPayment parsed = PaymentParser.parseApp(title, text);
        if (parsed == null) return;
        String raw = (title == null ? "" : title) + "\n" + (text == null ? "" : text);
        long now = System.currentTimeMillis();
        SpendStore.Captured captured = SpendStore.get(context).capture(parsed, source, source, raw.trim(), at, now);
        afterCapture(context, captured, true);
    }

    /** True when an email from {@code from} is one Gullak reads: capture on, bank emails on, and a listed sender. */
    static boolean readsMailFrom(Context context, String from) {
        return !paused(context) && sourceOn(context, SOURCE_MAIL) && MailSenders.match(from, mailSenders(context)) != null;
    }

    /**
     * A new-mail notification from a mail app ({@code from} is the sender's name as the notification shows it). Read
     * only when the sender matches a name listed in Settings → Bank emails; every other email is ignored without its
     * subject or text being read.
     */
    static void onMail(Context context, String from, String subject, String body, long at) {
        if (!readsMailFrom(context, from)) return;
        ParsedPayment parsed = PaymentParser.parseMail(from, subject, body);
        noteMail(context, from, at, parsed != null);
        if (parsed == null) {
            SpendCapturePlugin.changed();
            return;
        }
        long now = System.currentTimeMillis();
        String text = PaymentParser.mailText(subject, body);
        SpendStore.Captured captured = SpendStore.get(context).capture(parsed, SOURCE_MAIL, from, text, at, now);
        afterCapture(context, captured, true);
    }

    private static void noteMail(Context context, String from, long at, boolean payment) {
        JSONObject last = new JSONObject();
        try {
            last.put("sender", from.length() > MailSenders.MAX_NAME ? from.substring(0, MailSenders.MAX_NAME) : from);
            last.put("at", at);
            last.put("payment", payment);
        } catch (JSONException e) {
            return;
        }
        prefs(context).edit().putString(PREF_MAIL_LAST, last.toString()).apply();
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
        if (nudge && SpendStore.UNFILED.equals(captured.spend.status)) {
            SpendNotifier.show(context, captured.spend, !captured.isNew);
        }
        SpendCapturePlugin.changed();
    }
}
