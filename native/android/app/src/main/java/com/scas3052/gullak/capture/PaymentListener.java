package com.scas3052.gullak.capture;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Reads payment notifications from the apps in {@link PaymentApps} and the apps the user added in Settings.
 * Notifications from every other app, SMS apps included, are ignored without being read: only the posting app's
 * package name is noted, so Settings → Add app can list the apps that notify.
 */
public class PaymentListener extends NotificationListenerService {

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        // Android connects the listener again after a restart, which clears alarms: set the weekly reminder again.
        BalanceReminder.schedule(getApplicationContext());
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        Notification notification = sbn.getNotification();
        if (notification == null) return;
        if ((notification.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;
        final Context app = getApplicationContext();
        final String pkg = sbn.getPackageName();
        Capture.noteSeen(app, pkg, sbn.getPostTime());
        final String source = Capture.sourceForPackage(app, pkg);
        if (source == null) return;
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = notification.extras;
        if (extras == null) return;
        final String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        String body = text(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (body == null) body = text(extras.getCharSequence(Notification.EXTRA_TEXT));
        if (title == null && body == null) return;
        final String finalBody = body;
        final long at = sbn.getPostTime();
        Capture.run(() -> Capture.onNotification(app, source, title, finalBody, at));
    }

    private static String text(CharSequence value) {
        if (value == null) return null;
        String s = value.toString().trim();
        return s.isEmpty() ? null : s;
    }
}
