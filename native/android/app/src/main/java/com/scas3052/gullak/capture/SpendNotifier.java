package com.scas3052.gullak.capture;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import com.scas3052.gullak.MainActivity;
import com.scas3052.gullak.R;
import java.util.Date;

/**
 * One notification per captured payment: "₹500 at Swiggy, what was it for?". Tapping opens that spend in
 * Gullak (after the PIN, if one is set); Reply keeps a note for when Gullak opens. The lock screen only ever
 * shows "Gullak · 1 unfiled spend".
 */
public final class SpendNotifier {

    static final String CHANNEL = "payments_to_file";
    static final String EXTRA_SPEND_ID = "com.scas3052.gullak.SPEND_ID";
    static final String ACTION_OPEN = "com.scas3052.gullak.OPEN_SPEND";
    static final String ACTION_REPLY = "com.scas3052.gullak.REPLY";
    static final String KEY_REPLY = "gullak_reply";
    private static final int INK = 0xFF151515;

    private SpendNotifier() {}

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, context.getString(R.string.channel_payments),
                NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(context.getString(R.string.channel_payments_desc));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }

    static int idFor(String spendId) {
        return 0x40000000 | (spendId.hashCode() & 0x3FFFFFFF);
    }

    static boolean canNotify(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    /** "₹500 at Swiggy", "₹500 to ravi@okaxis", "₹72,000 from ACME CORP", "₹2,000 from the ATM". */
    static String headline(SpendStore.Spend spend) {
        String amount = PaymentParser.formatRupees(spend.amountPaise);
        String who = spend.party != null ? spend.party : spend.vpa;
        if ("atm".equals(spend.channel)) return amount + " cash from the ATM";
        if (ParsedPayment.IN.equals(spend.direction)) return who != null ? amount + " from " + who : amount + " received";
        if (who == null) return amount + " paid";
        return amount + ("card".equals(spend.channel) ? " at " : " to ") + who;
    }

    private static String details(Context context, SpendStore.Spend spend) {
        StringBuilder sb = new StringBuilder();
        if (spend.bank != null) sb.append(spend.bank);
        if (spend.account != null) sb.append(sb.length() > 0 ? " " : "").append("\u2022\u2022").append(spend.account);
        if (sb.length() > 0) sb.append(" \u00B7 ");
        sb.append(android.text.format.DateFormat.getTimeFormat(context).format(new Date(spend.at)));
        return sb.toString();
    }

    static PendingIntent openIntent(Context context, String spendId) {
        Intent intent = new Intent(context, MainActivity.class)
                .setAction(ACTION_OPEN)
                .putExtra(EXTRA_SPEND_ID, spendId)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, idFor(spendId), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent replyIntent(Context context, String spendId) {
        Intent intent = new Intent(context, ReplyReceiver.class).setAction(ACTION_REPLY).putExtra(EXTRA_SPEND_ID, spendId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        // RemoteInput fills the reply into this intent, so it has to stay mutable.
        if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(context, idFor(spendId), intent, flags);
    }

    /** Posts or refreshes the notification for {@code spend}. Refreshes (a merge, a reply) never buzz again. */
    @SuppressLint("MissingPermission")
    static void show(Context context, SpendStore.Spend spend, boolean refresh) {
        if (spend == null || !canNotify(context)) return;
        ensureChannel(context);
        String headline = headline(spend);
        boolean noted = spend.hint != null && !spend.hint.isEmpty();
        String title = noted ? headline : headline + ", what was it for?";
        String body = noted
                ? "Noted: \u201C" + spend.hint + "\u201D. Gullak files it with you when you open the app."
                : "Reply with a few words, or tap to file it.";
        String details = details(context, spend);

        int unfiled = Math.max(1, SpendStore.get(context).unfiledCount());
        Notification publicVersion = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_gullak)
                .setColor(INK)
                .setContentTitle(context.getString(R.string.app_name))
                .setContentText(unfiled == 1 ? "1 unfiled spend" : unfiled + " unfiled spends")
                .build();

        RemoteInput input = new RemoteInput.Builder(KEY_REPLY).setLabel("What was it for?").build();
        NotificationCompat.Action reply = new NotificationCompat.Action.Builder(R.drawable.ic_stat_gullak,
                noted ? "Change note" : "Reply", replyIntent(context, spend.id))
                .addRemoteInput(input)
                .setAllowGeneratedReplies(false)
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                .build();

        Notification notification = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_gullak)
                .setColor(INK)
                .setContentTitle(title)
                .setContentText(body)
                .setSubText(details)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(openIntent(context, spend.id))
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setSilent(refresh)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion)
                .setWhen(spend.at)
                .setShowWhen(true)
                .addAction(reply)
                .build();
        NotificationManagerCompat.from(context).notify(idFor(spend.id), notification);
    }

    static void cancel(Context context, String spendId) {
        NotificationManagerCompat.from(context).cancel(idFor(spendId));
    }
}
