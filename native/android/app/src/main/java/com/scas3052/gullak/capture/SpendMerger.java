package com.scas3052.gullak.capture;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Decides when two messages describe one payment, and what the merged spend keeps. Plain Java, unit-tested.
 *
 * <p>A message joins an existing spend when both carry the same reference number, or when messages from different
 * places (an SMS, an app notification, a shared text, a Scan &amp; Pay, a statement line) agree on amount and
 * direction within {@link #WINDOW_MS}. Two alerts from different apps can be one payment too (Google Pay and the
 * bank's own app both report it), as long as they don't name different accounts or payees. Two messages from the
 * same place never merge without a shared reference: two ₹20 teas from the same bank are two teas.
 */
public final class SpendMerger {

    /** How far apart an SMS and an app notification for the same payment can arrive. */
    public static final long WINDOW_MS = 15 * 60 * 1000L;
    /** Statement lines carry a date, not a time (they're stored at noon), so they match that day's alerts. */
    public static final long STATEMENT_WINDOW_MS = 36 * 60 * 60 * 1000L;

    public static final String KIND_SMS = "sms";
    public static final String KIND_APP = "app";
    public static final String KIND_SHARE = "share";
    /** A payment made with Scan &amp; Pay in Gullak (source "scanpay"). */
    public static final String KIND_PAY = "pay";
    /** A line imported from a bank statement (source "statement"). */
    public static final String KIND_STATEMENT = "statement";

    private SpendMerger() {}

    /** The parts of a spend that matching and merging look at. */
    public static final class Fields {
        public long amountPaise;
        public String direction;
        public long at;
        public String account;
        public String party;
        public String vpa;
        public String ref;
        public String channel;
        public String bank;
        public long balancePaise = -1;
        /** The Gullak account the user picked for it (Scan &amp; Pay, statement import), or null. */
        public String accountId;
        /** Comma-separated source names, e.g. "sms,gpay". */
        public String sources = "";

        public static Fields of(ParsedPayment p, long at, String source) {
            Fields f = new Fields();
            f.amountPaise = p.amountPaise;
            f.direction = p.direction;
            f.at = at;
            f.account = p.account;
            f.party = p.party;
            f.vpa = p.vpa;
            f.ref = p.ref;
            f.channel = p.channel;
            f.bank = p.bank;
            f.balancePaise = p.balancePaise;
            f.sources = source;
            return f;
        }
    }

    /** sms, app, share, pay or statement, for a source name such as "sms", "gpay", "share", "scanpay" or "statement". */
    public static String kindOf(String source) {
        if (KIND_SMS.equals(source)) return KIND_SMS;
        if (KIND_SHARE.equals(source)) return KIND_SHARE;
        if ("scanpay".equals(source)) return KIND_PAY;
        if (KIND_STATEMENT.equals(source)) return KIND_STATEMENT;
        return KIND_APP;
    }

    static boolean hasKind(String sources, String kind) {
        if (sources == null || sources.isEmpty()) return false;
        for (String source : sources.split(",")) {
            if (kindOf(source.trim()).equals(kind)) return true;
        }
        return false;
    }

    /**
     * True when {@code sources} already has a message from the same place as {@code source}, so a second one is a
     * second payment: the same app, or for SMS, shares, Scan &amp; Pay and statements, the same kind.
     */
    static boolean samePlace(String sources, String source) {
        if (sources == null || sources.isEmpty()) return false;
        String kind = kindOf(source);
        for (String s : sources.split(",")) {
            String existing = s.trim();
            if (KIND_APP.equals(kind) ? existing.equals(source) : kindOf(existing).equals(kind)) return true;
        }
        return false;
    }

    /** "1234" and "234" are the same account (banks show three or four digits); "1234" and "5678" aren't. */
    static boolean sameDigits(String a, String b) {
        return a.endsWith(b) || b.endsWith(a);
    }

    private static Set<String> words(String text) {
        Set<String> out = new HashSet<>();
        for (String word : text.toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (word.length() >= 3) out.add(word);
        }
        return out;
    }

    /** "Swiggy" and "SWIGGY BANGALORE" share a word; "Chai Point" and "Ravi Kumar" don't. */
    static boolean shareWord(String a, String b) {
        Set<String> first = words(a);
        for (String word : words(b)) {
            if (first.contains(word)) return true;
        }
        return false;
    }

    /**
     * False when the details rule out one payment: different accounts picked in Gullak, or two app alerts naming
     * different account digits or payees with no word in common. Merging two real payments would lose one, so
     * between two apps Gullak only merges what agrees.
     */
    static boolean compatible(Fields existing, Fields incoming) {
        if (existing.accountId != null && incoming.accountId != null && !existing.accountId.equals(incoming.accountId)) {
            return false;
        }
        if (!KIND_APP.equals(kindOf(incoming.sources)) || !hasKind(existing.sources, KIND_APP)) return true;
        if (existing.account != null && incoming.account != null && !sameDigits(existing.account, incoming.account)) {
            return false;
        }
        return existing.party == null || incoming.party == null || shareWord(existing.party, incoming.party);
    }

    /**
     * Index in {@code recent} of the spend {@code incoming} belongs to, or -1 when it is a new payment.
     * {@code incoming.sources} holds the single source the new message came from.
     */
    public static int match(List<Fields> recent, Fields incoming) {
        boolean statement = KIND_STATEMENT.equals(kindOf(incoming.sources));
        int best = -1;
        long bestGap = Long.MAX_VALUE;
        for (int i = 0; i < recent.size(); i++) {
            Fields c = recent.get(i);
            if (c.amountPaise != incoming.amountPaise || c.direction == null || !c.direction.equals(incoming.direction)) continue;
            boolean bothRefs = incoming.ref != null && c.ref != null;
            if (bothRefs && c.ref.toLowerCase(Locale.ROOT).equals(incoming.ref.toLowerCase(Locale.ROOT))) return i;
            if (bothRefs) continue;
            long gap = Math.abs(c.at - incoming.at);
            long window = statement || hasKind(c.sources, KIND_STATEMENT) ? STATEMENT_WINDOW_MS : WINDOW_MS;
            if (gap > window || samePlace(c.sources, incoming.sources) || !compatible(c, incoming)) continue;
            if (gap < bestGap) {
                best = i;
                bestGap = gap;
            }
        }
        return best;
    }

    /**
     * {@code existing} with {@code incoming} folded in: the app's merchant name, the bank's account digits and
     * balance, the earliest time, and every source.
     */
    public static Fields combine(Fields existing, Fields incoming) {
        boolean incomingIsSms = KIND_SMS.equals(kindOf(incoming.sources));
        boolean incomingIsApp = KIND_APP.equals(kindOf(incoming.sources));
        boolean existingHasApp = hasKind(existing.sources, KIND_APP);
        Fields out = new Fields();
        out.amountPaise = existing.amountPaise;
        out.direction = existing.direction;
        out.at = Math.min(existing.at, incoming.at);
        // The first app's payee name stays: a second app (often the bank's) adds a source, not a new name.
        if (incomingIsApp && incoming.party != null && !(existingHasApp && existing.party != null)) out.party = incoming.party;
        else if (existingHasApp && existing.party != null) out.party = existing.party;
        else out.party = existing.party != null ? existing.party : incoming.party;
        out.account = incomingIsSms && incoming.account != null ? incoming.account : first(existing.account, incoming.account);
        out.bank = incomingIsSms && incoming.bank != null ? incoming.bank : first(existing.bank, incoming.bank);
        out.balancePaise = incomingIsSms && incoming.balancePaise >= 0 ? incoming.balancePaise
                : existing.balancePaise >= 0 ? existing.balancePaise : incoming.balancePaise;
        out.vpa = first(existing.vpa, incoming.vpa);
        out.ref = first(existing.ref, incoming.ref);
        out.channel = first(existing.channel, incoming.channel);
        out.accountId = first(existing.accountId, incoming.accountId);
        out.sources = addSource(existing.sources, incoming.sources);
        return out;
    }

    private static String first(String a, String b) {
        return a != null ? a : b;
    }

    static String addSource(String sources, String source) {
        if (sources == null || sources.isEmpty()) return source;
        for (String s : sources.split(",")) {
            if (s.trim().equals(source)) return sources;
        }
        return sources + "," + source;
    }
}
