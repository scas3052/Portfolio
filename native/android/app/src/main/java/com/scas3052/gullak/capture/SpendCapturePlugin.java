package com.scas3052.gullak.capture;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.List;
import org.json.JSONException;

/**
 * The bridge between captured payments and Gullak's web code (src/finance/inbox/bridge.js): permission status
 * and requests, the inbox catch-up scan, the list of spends, and filing, dismissing and restoring them.
 *
 * <p>Events: {@code changed} whenever the list changes, and {@code openSpend} ({id}) when a payment
 * notification or a share opens Gullak.
 */
@CapacitorPlugin(
        name = "SpendCapture",
        permissions = {
            @Permission(alias = "sms", strings = {Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS}),
            @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
        })
public class SpendCapturePlugin extends Plugin {

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

    /** A notification tap or a share names a spend; the event waits until the web code listens. */
    private void noteIntent(Intent intent) {
        if (intent == null) return;
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
        for (String source : Capture.SOURCES) sources.put(source, Capture.sourceOn(context, source));
        status.put("sources", sources);
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
            for (String source : Capture.SOURCES) {
                if (sources.has(source)) edit.putBoolean("src_" + source, sources.optBoolean(source, true));
            }
        }
        edit.apply();
        call.resolve(status());
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
        return o;
    }
}
