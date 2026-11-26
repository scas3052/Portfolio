package com.scas3052.gullak.capture;

import java.util.Collection;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Which emails Gullak reads: the ones whose sender, as the mail app's notification names it, matches a name listed in
 * Settings → Payment capture → Bank emails (slice out of the box). Every other email is ignored without its subject
 * or text being read. Plain Java, so the matching is unit-tested without Android.
 */
public final class MailSenders {

    /** The senders read until the user changes the list. */
    public static final String[] DEFAULT = {"slice"};
    static final int MAX_NAME = 60;
    static final int MAX_SENDERS = 20;

    private static final Pattern NOT_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final Pattern SPACES = Pattern.compile("\\s+");

    private MailSenders() {}

    /** Lower-case words joined by single spaces, with a space at each end: " hdfc bank instaalerts ". */
    static String words(String text) {
        if (text == null) return " ";
        return " " + NOT_WORD.matcher(text.toLowerCase(Locale.ROOT)).replaceAll(" ").trim() + " ";
    }

    private static boolean blank(String text) {
        return words(text).trim().isEmpty();
    }

    /**
     * The listed sender that {@code from} (the sender's name on a mail notification) matches, or null. A listed name
     * matches when its words appear together in the sender's name: "slice" matches "slice", "Team slice" and
     * "alerts@slice.bank.in", not "Slicepay"; "HDFC Bank" matches "HDFC Bank InstaAlerts".
     */
    public static String match(String from, Collection<String> senders) {
        if (from == null || senders == null || blank(from)) return null;
        String name = words(from);
        for (String sender : senders) {
            if (sender != null && !blank(sender) && name.contains(words(sender))) return sender;
        }
        return null;
    }

    /** A name typed in Settings, tidied: spaces collapsed, at most 60 characters. Null when it has no letters or digits. */
    public static String clean(String name) {
        if (name == null) return null;
        String tidy = SPACES.matcher(name).replaceAll(" ").trim();
        if (blank(tidy)) return null;
        return tidy.length() > MAX_NAME ? tidy.substring(0, MAX_NAME).trim() : tidy;
    }

    /** True when {@code a} and {@code b} name the same sender, ignoring case and punctuation. */
    public static boolean same(String a, String b) {
        return words(a).equals(words(b));
    }
}
