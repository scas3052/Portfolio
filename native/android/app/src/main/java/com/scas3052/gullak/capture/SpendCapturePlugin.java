package com.scas3052.gullak.capture;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The bridge between captured payments and Gullak's web code (src/finance/inbox/bridge.js): permission status
 * and requests, which apps are read, the inbox catch-up scan, the list of spends, and filing, dismissing and
 * restoring them; plus Scan & Pay (QR scan, hand-off to a UPI app, recording the payment), statement import and
 * the weekly balance check reminder.
 *
 * <p>Events: {@code changed} whenever the list changes, {@code openSpend} ({id}) when a payment notification or a
 * share opens Gullak, {@code scanPay} from the Scan & Pay shortcut, and {@code balanceCheck} from the reminder.
 */
@CapacitorPlugin(
        name = "SpendCapture",
        permissions = {
            @Permission(alias = "sms", strings = {Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS}),
            @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
        })
public class SpendCapturePlugin extends Plugin {

    static final String ACTION_SCAN_PAY = "com.scas3052.gullak.SCAN_PAY";
    private static final Set<String> UPI_ANSWER_KEYS =
            new HashSet<>(Arrays.asList("status", "txnid", "txnref", "approvalrefno", "responsecode"));
    private static final int MAX_IMPORT_ROWS = 2000;

    private static volatile SpendCapturePlugin live;

    /** Tells the open app (if any) that the list of spends changed. Safe from any thread. */
    static void changed() {
        SpendCapturePlugin plugin = live;
        if (plugin != null) plugin.notifyListeners("changed", new JSObject());
    }

    @Override
    public void load() {
        live = this;
        SpendNotifier.ensureChannel(getContext());
        BalanceReminder.schedule(getContext());
        Activity activity = getActivity();
        if (activity != null) noteIntent(activity.getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        noteIntent(intent);
    }

    @Override
    protected void handleOnDestroy() {
        if (live == this) live = null;
        super.handleOnDestroy();
    }

    /**
     * A notification tap or a share names a spend; the Scan & Pay shortcut and the balance reminder open their
     * screens. Each event waits until the web code listens, and is handled once.
     */
    private void noteIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_SCAN_PAY.equals(action) || BalanceReminder.ACTION_OPEN.equals(action)) {
            intent.setAction(Intent.ACTION_MAIN);
            if (BalanceReminder.ACTION_OPEN.equals(action)) BalanceReminder.cancel(getContext());
            notifyListeners(ACTION_SCAN_PAY.equals(action) ? "scanPay" : "balanceCheck", new JSObject(), true);
            return;
        }
        String id = intent.getStringExtra(SpendNotifier.EXTRA_SPEND_ID);
        if (id == null) return;
        intent.removeExtra(SpendNotifier.EXTRA_SPEND_ID);
        JSObject data = new JSObject();
        data.put("id", id);
        notifyListeners("openSpend", data, true);
    }

    // ---- status and permissions ------------------------------------------------------------------

    private JSObject status() {
        Context context = getContext();
        SharedPreferences prefs = Capture.prefs(context);
        JSObject status = new JSObject();
        status.put("available", true);
        status.put("sms", getPermissionState("sms").toString());
        if (Build.VERSION.SDK_INT >= 33) {
            status.put("notifications", getPermissionState("notifications").toString());
        } else {
            status.put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled() ? "granted" : "denied");
        }
        status.put("listener", NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.getPackageName()));
        status.put("telephony", context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY));
        status.put("paused", prefs.getBoolean(Capture.PREF_PAUSED, false));
        JSObject sources = new JSObject();
        for (String source : Capture.sourceIds(context)) sources.put(source, Capture.sourceOn(context, source));
        status.put("sources", sources);
        status.put("apps", appsStatus(context));
        status.put("lookbackSet", prefs.getBoolean(Capture.PREF_LOOKBACK_SET, false));
        status.put("lastScanAt", prefs.getLong(Capture.PREF_LAST_SCAN, 0));
        status.put("sdk", Build.VERSION.SDK_INT);
        status.put("unfiled", SpendStore.get(context).unfiledCount());
        return status;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void requestSms(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            call.resolve(status());
        } else {
            requestPermissionForAlias("sms", call, "afterPermission");
        }
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(status());
        } else {
            requestPermissionForAlias("notifications", call, "afterPermission");
        }
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        call.resolve(status());
    }

    /** Opens the system screen where notification access is switched on (Gullak's own page where possible). */
    @PluginMethod
    public void openListenerSettings(PluginCall call) {
        Context context = getContext();
        Intent intent;
        if (Build.VERSION.SDK_INT >= 30) {
            intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
            intent.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    new ComponentName(context, PaymentListener.class).flattenToString());
        } else {
            intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
        } catch (RuntimeException e) {
            context.startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    /** Opens Gullak's App info page, where "Allow restricted settings" and permissions live. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void setPrefs(PluginCall call) {
        SharedPreferences.Editor edit = Capture.prefs(getContext()).edit();
        Boolean paused = call.getBoolean("paused");
        if (paused != null) edit.putBoolean(Capture.PREF_PAUSED, paused);
        JSObject sources = call.getObject("sources");
        if (sources != null) {
            for (String source : Capture.sourceIds(getContext())) {
                if (sources.has(source)) edit.putBoolean("src_" + source, sources.optBoolean(source, true));
            }
        }
        edit.apply();
        call.resolve(status());
    }

    // ---- which apps are read ------------------------------------------------------------------------

    private static boolean installed(PackageManager pm, String pkg) {
        try {
            pm.getApplicationInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Every app Gullak reads or can read: the built-in ones (with whether they're on this phone) and the added ones. */
    private static JSArray appsStatus(Context context) {
        PackageManager pm = context.getPackageManager();
        JSArray apps = new JSArray();
        for (PaymentApps.App app : PaymentApps.BUILT_IN) {
            apps.put(appStatus(context, app.source, app.packageName, app.label, true, installed(pm, app.packageName)));
        }
        for (Map.Entry<String, String> added : Capture.addedApps(context).entrySet()) {
            apps.put(appStatus(context, added.getKey(), added.getKey(), added.getValue(), false, installed(pm, added.getKey())));
        }
        return apps;
    }

    private static JSObject appStatus(Context context, String id, String pkg, String label, boolean builtIn, boolean installed) {
        JSObject app = new JSObject();
        app.put("id", id);
        app.put("package", pkg);
        app.put("label", label);
        app.put("builtIn", builtIn);
        app.put("installed", installed);
        app.put("on", Capture.sourceOn(context, id));
        return app;
    }

    /** The apps on this phone (name and package only), for Settings → Add app; the ones that notify come first. */
    @PluginMethod
    public void listApps(PluginCall call) {
        Context context = getContext();
        Capture.run(() -> {
            PackageManager pm = context.getPackageManager();
            Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            Map<String, Long> seen = Capture.seenApps(context);
            Map<String, String> added = Capture.addedApps(context);
            Set<String> listed = new HashSet<>();
            JSArray apps = new JSArray();
            for (ResolveInfo info : pm.queryIntentActivities(launcher, 0)) {
                String pkg = info.activityInfo.packageName;
                if (pkg.equals(context.getPackageName()) || !listed.add(pkg)) continue;
                JSObject app = new JSObject();
                app.put("package", pkg);
                app.put("label", String.valueOf(info.loadLabel(pm)));
                Long lastSeen = seen.get(pkg);
                app.put("lastSeen", lastSeen == null ? 0 : (long) lastSeen);
                app.put("read", PaymentApps.builtIn(pkg) != null || added.containsKey(pkg));
                apps.put(app);
            }
            JSObject result = new JSObject();
            result.put("apps", apps);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void addApp(PluginCall call) {
        String pkg = call.getString("package");
        if (!PaymentApps.addable(pkg, getContext().getPackageName())) {
            call.reject("That app can't be added");
            return;
        }
        Capture.addApp(getContext(), pkg, call.getString("label", pkg));
        call.resolve(status());
    }

    @PluginMethod
    public void removeApp(PluginCall call) {
        String pkg = call.getString("package");
        if (pkg == null) {
            call.reject("package is required");
            return;
        }
        Capture.removeApp(getContext(), pkg);
        call.resolve(status());
    }

    // ---- Scan & Pay -------------------------------------------------------------------------------

    /** Opens Google's code scanner (it runs in Google Play services, so Gullak needs no camera permission). */
    @PluginMethod
    public void scanQr(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Gullak isn't open");
            return;
        }
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(activity, options);
        scanner.startScan()
                .addOnSuccessListener(barcode -> {
                    JSObject result = new JSObject();
                    result.put("value", barcode.getRawValue());
                    call.resolve(result);
                })
                .addOnCanceledListener(() -> {
                    JSObject result = new JSObject();
                    result.put("cancelled", true);
                    call.resolve(result);
                })
                .addOnFailureListener(error -> call.reject(
                        "The scanner didn't open. The first time, Google Play services may still be setting it up: try again in a minute."));
    }

    /** UPI apps on this phone that can take a payment link, for the "Pay with" choice. */
    @PluginMethod
    public void listUpiApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent upi = new Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay"));
        Set<String> listed = new HashSet<>();
        JSArray apps = new JSArray();
        for (ResolveInfo info : pm.queryIntentActivities(upi, 0)) {
            String pkg = info.activityInfo.packageName;
            if (!listed.add(pkg)) continue;
            JSObject app = new JSObject();
            app.put("package", pkg);
            app.put("label", String.valueOf(info.loadLabel(pm)));
            apps.put(app);
        }
        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    /** Hands a {@code upi://pay} link to a UPI app; resolves with what that app reports when it comes back. */
    @PluginMethod
    public void payUpi(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || !uri.toLowerCase(Locale.ROOT).startsWith("upi://pay")) {
            call.reject("That isn't a UPI payment link");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        String pkg = call.getString("package");
        if (pkg != null && !pkg.isEmpty()) intent.setPackage(pkg);
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("No UPI app on this phone can take this payment");
            return;
        }
        startActivityForResult(call, intent, "afterPayment");
    }

    @ActivityCallback
    private void afterPayment(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject answer = new JSObject();
        answer.put("resultCode", result.getResultCode());
        JSObject extras = new JSObject();
        Intent data = result.getData();
        if (data != null) {
            String response = data.getStringExtra("response");
            if (response != null) answer.put("response", response);
            Bundle bundle = data.getExtras();
            if (bundle != null) {
                for (String key : bundle.keySet()) {
                    if (!UPI_ANSWER_KEYS.contains(key.toLowerCase(Locale.ROOT))) continue;
                    Object value = bundle.get(key);
                    if (value != null) extras.put(key, String.valueOf(value));
                }
            }
        }
        answer.put("extras", extras);
        call.resolve(answer);
    }

    private static String clean(String value, int max) {
        if (value == null) return null;
        String text = PaymentParser.normalize(value);
        if (text.isEmpty()) return null;
        return text.length() > max ? text.substring(0, max) : text;
    }

    /** Last three or four digits of an account number, or null. */
    private static String digits(String value) {
        if (value == null) return null;
        String only = value.replaceAll("\\D", "");
        if (only.length() < 3) return null;
        return only.length() > 4 ? only.substring(only.length() - 4) : only;
    }

    /** A 12-digit bank reference (what bank SMS quote), or null for anything else. */
    private static String rrn(String value) {
        return value != null && value.matches("\\d{12}") ? value : null;
    }

    private static String opt(JSONObject row, String key) {
        if (row == null || row.isNull(key)) return null;
        String value = row.optString(key, "").trim();
        return value.isEmpty() ? null : value;
    }

    /**
     * Records a payment made with Scan & Pay as an unfiled spend on the account the user picked, with their note.
     * The payment's own app alert or bank SMS merges into it when it arrives. Resolves with the spend's id.
     */
    @PluginMethod
    public void recordPayment(PluginCall call) {
        // PluginCall.getLong() returns null for a JSON number that parsed as an Integer, i.e. any amount under ~₹2.1 crore.
        long paise = call.getData().optLong("amountPaise", 0);
        if (paise <= 0 || paise >= 10_000_000_000L) {
            call.reject("amountPaise is required");
            return;
        }
        String party = clean(call.getString("party"), 60);
        String vpa = clean(call.getString("vpa"), 80);
        String ref = rrn(call.getString("ref"));
        String app = clean(call.getString("app"), 40);
        String note = call.getString("note");
        String accountId = clean(call.getString("accountId"), 64);
        ParsedPayment parsed = new ParsedPayment(paise, ParsedPayment.OUT, digits(call.getString("account")), party,
                vpa != null ? vpa.toLowerCase(Locale.ROOT) : null, ref, "upi", clean(call.getString("bank"), 40), -1);
        String who = party != null ? party : vpa != null ? vpa : "a UPI payee";
        String text = "Paid " + PaymentParser.formatRupees(paise) + " to " + who
                + (vpa != null && party != null ? " (" + vpa + ")" : "")
                + (app != null ? " with " + app : "")
                + (ref != null ? ". Ref " + ref : "");
        long at = System.currentTimeMillis();
        Context context = getContext();
        Capture.run(() -> {
            SpendStore.Captured captured = Capture.onDirect(context, parsed, Capture.SOURCE_SCANPAY, "Scan & Pay", text, at, accountId);
            String id = captured != null && captured.spend != null ? captured.spend.id : null;
            if (id != null && note != null && !note.trim().isEmpty()) {
                SpendStore.get(context).setHint(id, note, System.currentTimeMillis());
                changed();
            }
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("duplicate", captured != null && captured.duplicate);
            call.resolve(result);
        });
    }

    // ---- statement import -------------------------------------------------------------------------

    /**
     * Stores bank statement lines the web code has already checked against the book: each becomes an unfiled spend
     * on the chosen account, or merges into a payment Gullak caught. Resolves with {added, merged, duplicates}.
     */
    @PluginMethod
    public void importSpends(PluginCall call) {
        JSArray rows = call.getArray("rows");
        if (rows == null) {
            call.reject("rows is required");
            return;
        }
        Context context = getContext();
        Capture.run(() -> {
            SpendStore store = SpendStore.get(context);
            long now = System.currentTimeMillis();
            int added = 0;
            int merged = 0;
            int duplicates = 0;
            for (int i = 0; i < rows.length() && i < MAX_IMPORT_ROWS; i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                long paise = row.optLong("amountPaise", 0);
                long at = row.optLong("at", 0);
                if (paise <= 0 || paise >= 10_000_000_000L || at <= 0) continue;
                String vpa = clean(opt(row, "vpa"), 80);
                ParsedPayment parsed = new ParsedPayment(paise, "in".equals(opt(row, "direction")) ? ParsedPayment.IN : ParsedPayment.OUT,
                        digits(opt(row, "account")), clean(opt(row, "party"), 60), vpa != null ? vpa.toLowerCase(Locale.ROOT) : null,
                        rrn(opt(row, "ref")), clean(opt(row, "channel"), 12), clean(opt(row, "bank"), 40), -1);
                String text = clean(opt(row, "text"), 400);
                SpendStore.Captured captured = store.capture(parsed, Capture.SOURCE_STATEMENT, "Statement",
                        text != null ? text : PaymentParser.formatRupees(paise), at, now, clean(opt(row, "accountId"), 64));
                if (captured.duplicate) duplicates++;
                else if (captured.isNew) added++;
                else merged++;
            }
            if (added + merged > 0) changed();
            JSObject result = new JSObject();
            result.put("added", added);
            result.put("merged", merged);
            result.put("duplicates", duplicates);
            call.resolve(result);
        });
    }

    // ---- weekly balance check ---------------------------------------------------------------------

    /** Turns the weekly balance check reminder on or off ({enabled, weekday 0 = Sunday, hour}). */
    @PluginMethod
    public void setBalanceReminder(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        BalanceReminder.configure(getContext(), on, call.getInt("weekday", 0), call.getInt("hour", 19));
        call.resolve();
    }

    // ---- spends -----------------------------------------------------------------------------------

    /** Reads the SMS inbox for payments missed while Gullak was closed. Pass {days} once to pick the first look-back. */
    @PluginMethod
    public void scanInbox(PluginCall call) {
        Integer days = call.getInt("days");
        int added = Capture.scanInbox(getContext(), days);
        JSObject result = new JSObject();
        result.put("added", Math.max(0, added));
        result.put("needsLookback", added < 0);
        call.resolve(result);
    }

    @PluginMethod
    public void list(PluginCall call) {
        List<SpendStore.Spend> spends = SpendStore.get(getContext()).list(System.currentTimeMillis());
        JSArray items = new JSArray();
        for (SpendStore.Spend spend : spends) items.put(toJS(spend));
        JSObject result = new JSObject();
        result.put("spends", items);
        call.resolve(result);
    }

    /** The original message text, for the "Original message" fold. Gone once the spend is filed or dismissed. */
    @PluginMethod
    public void getOriginal(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        String raw = SpendStore.get(getContext()).original(id);
        JSObject result = new JSObject();
        try {
            result.put("messages", raw == null ? new JSArray() : new JSArray(raw));
        } catch (JSONException e) {
            result.put("messages", new JSArray());
        }
        call.resolve(result);
    }

    @PluginMethod
    public void markFiled(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        JSArray entries = call.getArray("entryIds");
        StringBuilder ids = new StringBuilder();
        if (entries != null) {
            for (int i = 0; i < entries.length(); i++) {
                String entry = entries.optString(i, "");
                if (entry.isEmpty()) continue;
                if (ids.length() > 0) ids.append(',');
                ids.append(entry);
            }
        }
        boolean ok = SpendStore.get(getContext()).markFiled(id, ids.toString(), System.currentTimeMillis());
        SpendNotifier.cancel(getContext(), id);
        resolveOk(call, ok);
    }

    @PluginMethod
    public void dismiss(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        boolean ok = SpendStore.get(getContext()).dismiss(id, System.currentTimeMillis());
        SpendNotifier.cancel(getContext(), id);
        resolveOk(call, ok);
    }

    @PluginMethod
    public void restore(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        resolveOk(call, SpendStore.get(getContext()).restore(id, System.currentTimeMillis()));
    }

    @PluginMethod
    public void setHint(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        resolveOk(call, SpendStore.get(getContext()).setHint(id, call.getString("hint", ""), System.currentTimeMillis()));
    }

    private static void resolveOk(PluginCall call, boolean ok) {
        JSObject result = new JSObject();
        result.put("ok", ok);
        call.resolve(result);
    }

    private static JSObject toJS(SpendStore.Spend s) {
        JSObject o = new JSObject();
        o.put("id", s.id);
        o.put("status", s.status);
        o.put("amountPaise", s.amountPaise);
        o.put("direction", s.direction);
        o.put("at", s.at);
        o.put("account", s.account);
        o.put("party", s.party);
        o.put("vpa", s.vpa);
        o.put("ref", s.ref);
        o.put("channel", s.channel);
        o.put("bank", s.bank);
        if (s.balancePaise >= 0) o.put("balancePaise", s.balancePaise);
        JSArray sources = new JSArray();
        if (s.sources != null) for (String source : s.sources.split(",")) if (!source.isEmpty()) sources.put(source);
        o.put("sources", sources);
        o.put("hasOriginal", s.hasRaw);
        o.put("hint", s.hint);
        o.put("hintAt", s.hintAt);
        JSArray entryIds = new JSArray();
        if (s.entryIds != null) for (String entry : s.entryIds.split(",")) if (!entry.isEmpty()) entryIds.put(entry);
        o.put("entryIds", entryIds);
        o.put("createdAt", s.createdAt);
        o.put("closedAt", s.closedAt);
        o.put("accountId", s.accountId);
        return o;
    }
}
