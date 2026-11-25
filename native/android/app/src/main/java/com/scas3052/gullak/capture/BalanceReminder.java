package com.scas3052.gullak.capture;

import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.scas3052.gullak.MainActivity;
import com.scas3052.gullak.R;
import java.util.Calendar;

/**
 * The weekly "what does your bank show?" reminder for the balance check. An inexact alarm (no exact-alarm
 * permission, easy on the battery) fires on the chosen weekday evening and posts one notification that opens the
 * check. Alarms don't survive a restart, so the reminder is set again whenever Gullak opens and whenever Android
 * reconnects the notification listener, which it does after a restart.
 */
public class BalanceReminder extends BroadcastReceiver {

    static final String ACTION_REMIND = "com.scas3052.gullak.BALANCE_REMINDER";
    static final String ACTION_OPEN = "com.scas3052.gullak.BALANCE_CHECK";
    static final String CHANNEL = "balance_checks";
    private static final String PREF_ON = "balance_reminder";
    private static final String PREF_WEEKDAY = "balance_weekday";
    private static final String PREF_HOUR = "balance_hour";
    private static final int REQUEST = 0x0BA1;
    private static final long WEEK_MS = 7L * 24 * 60 * 60 * 1000;
    private static final int INK = 0xFF151515;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_REMIND.equals(intent.getAction())) return;
        if (!Capture.prefs(context).getBoolean(PREF_ON, false)) return;
        show(context.getApplicationContext());
    }

    /** Turns the reminder on or off. {@code weekday} counts from 0 = Sunday, like JavaScript's Date. */
    static void configure(Context context, boolean on, int weekday, int hour) {
        Capture.prefs(context).edit()
                .putBoolean(PREF_ON, on)
                .putInt(PREF_WEEKDAY, Math.max(0, Math.min(6, weekday)))
                .putInt(PREF_HOUR, Math.max(0, Math.min(23, hour)))
                .apply();
        schedule(context);
        if (!on) cancel(context);
    }

    /** Sets (or clears) the repeating alarm from the saved settings. */
    static void schedule(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        PendingIntent pending = alarmIntent(context);
        alarms.cancel(pending);
        SharedPreferences prefs = Capture.prefs(context);
        if (!prefs.getBoolean(PREF_ON, false)) return;
        long first = nextTrigger(System.currentTimeMillis(), prefs.getInt(PREF_WEEKDAY, 0), prefs.getInt(PREF_HOUR, 19));
        alarms.setInexactRepeating(AlarmManager.RTC, first, WEEK_MS, pending);
    }

    /** The next {@code weekday} (0 = Sunday) at {@code hour}:00 local time after {@code now}. */
    static long nextTrigger(long now, int weekday, int hour) {
        Calendar at = Calendar.getInstance();
        at.setTimeInMillis(now);
        at.set(Calendar.HOUR_OF_DAY, hour);
        at.set(Calendar.MINUTE, 0);
        at.set(Calendar.SECOND, 0);
        at.set(Calendar.MILLISECOND, 0);
        int today = at.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
        at.add(Calendar.DAY_OF_YEAR, (weekday - today + 7) % 7);
        if (at.getTimeInMillis() <= now) at.add(Calendar.DAY_OF_YEAR, 7);
        return at.getTimeInMillis();
    }

    private static PendingIntent alarmIntent(Context context) {
        Intent intent = new Intent(context, BalanceReminder.class).setAction(ACTION_REMIND);
        return PendingIntent.getBroadcast(context, REQUEST, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, context.getString(R.string.channel_balance),
                NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(context.getString(R.string.channel_balance_desc));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }

    @SuppressLint("MissingPermission")
    static void show(Context context) {
        if (!SpendNotifier.canNotify(context)) return;
        ensureChannel(context);
        Intent open = new Intent(context, MainActivity.class)
                .setAction(ACTION_OPEN)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, REQUEST, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String body = "What do your bank apps show right now? Type it in and Gullak shows what it missed.";
        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_gullak)
                .setColor(INK)
                .setContentTitle("Weekly balance check")
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .build();
        NotificationManagerCompat.from(context).notify(REQUEST, notification);
    }

    static void cancel(Context context) {
        NotificationManagerCompat.from(context).cancel(REQUEST);
    }
}
