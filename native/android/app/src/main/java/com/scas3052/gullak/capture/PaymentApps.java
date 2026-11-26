package com.scas3052.gullak.capture;

import java.util.Collection;
import java.util.regex.Pattern;

/**
 * The payment and bank apps whose notifications Gullak reads out of the box, and the source name each one's
 * payments carry. Apps the user adds in Settings are read too, under their package name. Mail apps are read only
 * for the bank senders listed in Settings ({@link MailSenders}). Every other app's notifications are ignored without
 * being read. Plain Java, so the lookup is unit-tested without Android.
 *
 * <p>One parser reads every app's alerts ({@link PaymentParser#parseApp}); an app needs its own rule only when its
 * wording is unusual, and then the rule goes into the parser with an example in payment-fixtures.txt.
 */
public final class PaymentApps {

    /** One app Gullak knows: its source name, package name and the name Settings shows. */
    public static final class App {
        public final String source;
        public final String packageName;
        public final String label;

        App(String source, String packageName, String label) {
            this.source = source;
            this.packageName = packageName;
            this.label = label;
        }
    }

    /** Package names as published on Google Play. */
    public static final App[] BUILT_IN = {
        new App("gpay", "com.google.android.apps.nbu.paisa.user", "Google Pay"),
        new App("phonepe", "com.phonepe.app", "PhonePe"),
        new App("paytm", "net.one97.paytm", "Paytm"),
        new App("slice", "indwin.c3.shareapp", "slice"),
        new App("cred", "com.dreamplug.androidapp", "CRED"),
        new App("bhim", "in.org.npci.upiapp", "BHIM"),
        new App("navi", "com.naviapp", "Navi"),
        new App("supermoney", "money.super.payments", "super.money"),
        new App("mobikwik", "com.mobikwik_new", "MobiKwik"),
        new App("yono", "com.sbi.lotusintouch", "YONO SBI"),
        new App("imobile", "com.csam.icici.bank.imobile", "ICICI iMobile"),
        new App("hdfc", "com.snapwork.hdfc", "HDFC Bank"),
    };

    /**
     * Mail apps: their new-mail notifications are checked for the bank senders listed in Settings, and payments
     * found there carry the source "mail". They can't be added as payment apps.
     */
    public static final App[] MAIL = {
        new App("mail", "com.google.android.gm", "Gmail"),
        new App("mail", "com.microsoft.office.outlook", "Outlook"),
        new App("mail", "com.samsung.android.email.provider", "Samsung Email"),
        new App("mail", "com.yahoo.mobile.client.android.mail", "Yahoo Mail"),
    };

    private static final Pattern PACKAGE = Pattern.compile("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+");

    private PaymentApps() {}

    /** The built-in app with this package name, or null. */
    public static App builtIn(String packageName) {
        if (packageName == null) return null;
        for (App app : BUILT_IN) {
            if (app.packageName.equals(packageName)) return app;
        }
        return null;
    }

    /** True for a mail app, whose notifications are only checked for the bank senders listed in Settings. */
    public static boolean isMail(String packageName) {
        if (packageName == null) return false;
        for (App app : MAIL) {
            if (app.packageName.equals(packageName)) return true;
        }
        return false;
    }

    /** The built-in app with this source name, or null. */
    public static App bySource(String source) {
        if (source == null) return null;
        for (App app : BUILT_IN) {
            if (app.source.equals(source)) return app;
        }
        return null;
    }

    /**
     * The source name for a notification from {@code packageName}: a built-in app's short name, the package name of
     * an app the user added, or null for every other app (whose notification is then not read). Mail apps are never
     * read as payment apps, even if added before they were known as mail apps.
     */
    public static String sourceFor(String packageName, Collection<String> added) {
        if (packageName == null || packageName.isEmpty() || isMail(packageName)) return null;
        App app = builtIn(packageName);
        if (app != null) return app.source;
        return added != null && added.contains(packageName) ? packageName : null;
    }

    /**
     * True for a package the user can add: shaped like a package name, not Gullak itself, not already built in and
     * not a mail app (bank emails are picked by sender instead).
     */
    public static boolean addable(String packageName, String ownPackage) {
        return packageName != null && PACKAGE.matcher(packageName).matches() && !packageName.equals(ownPackage)
                && builtIn(packageName) == null && !isMail(packageName);
    }
}
