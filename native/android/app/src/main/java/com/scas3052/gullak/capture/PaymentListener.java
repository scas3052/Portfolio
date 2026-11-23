package com.scas3052.gullak.capture;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Reads payment notifications from GPay, PhonePe and Paytm only. Notifications from every other app,
 * SMS apps included, are ignored without being read.
 */
public class PaymentListener extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        final String source = Capture.sourceForPackage(sbn.getPackageName());
        if (source == null) return;
        Notification notification = sbn.getNotification();
        if (notification == null) return;
        if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        if ((notification.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;
        Bundle extras = notification.extras;
        if (extras == null) return;
        final String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        String body = text(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (body == null) body = text(extras.getCharSequence(Notification.EXTRA_TEXT));
        if (title == null && body == null) return;
        final String finalBody = body;
        final long at = sbn.getPostTime();
        final Context app = getApplicationContext();
        Capture.run(() -> Capture.onNotification(app, source, title, finalBody, at));
    }

    private static String text(CharSequence value) {
        if (value == null) return null;
        String s = value.toString().trim();
        return s.isEmpty() ? null : s;
    }
}
