package com.scas3052.gullak.capture;

import java.util.List;
import java.util.Locale;

/**
 * Decides when two messages describe one payment, and what the merged spend keeps. Plain Java, unit-tested.
 *
 * <p>A message joins an existing spend when both carry the same reference number, or when an SMS and an app
 * notification (or a shared text) agree on amount and direction within {@link #WINDOW_MS}. Two messages of the
 * same kind never merge without a shared reference: two ₹20 teas from the same bank are two teas.
 */
public final class SpendMerger {

    /** How far apart an SMS and an app notification for the same payment can arrive. */
    public static final long WINDOW_MS = 15 * 60 * 1000L;

    public static final String KIND_SMS = "sms";
    public static final String KIND_APP = "app";
    public static final String KIND_SHARE = "share";

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

    /** sms, app or share, for a source name such as "sms", "gpay" or "share". */
    public static String kindOf(String source) {
        if (KIND_SMS.equals(source)) return KIND_SMS;
        if (KIND_SHARE.equals(source)) return KIND_SHARE;
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
     * Index in {@code recent} of the spend {@code incoming} belongs to, or -1 when it is a new payment.
     * {@code incoming.sources} holds the single source the new message came from.
     */
    public static int match(List<Fields> recent, Fields incoming) {
        String kind = kindOf(incoming.sources);
        int best = -1;
        long bestGap = Long.MAX_VALUE;
        for (int i = 0; i < recent.size(); i++) {
            Fields c = recent.get(i);
            if (c.amountPaise != incoming.amountPaise || c.direction == null || !c.direction.equals(incoming.direction)) continue;
            boolean bothRefs = incoming.ref != null && c.ref != null;
            if (bothRefs && c.ref.toLowerCase(Locale.ROOT).equals(incoming.ref.toLowerCase(Locale.ROOT))) return i;
            if (bothRefs) continue;
            long gap = Math.abs(c.at - incoming.at);
            if (gap > WINDOW_MS || hasKind(c.sources, kind)) continue;
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
        if (incomingIsApp && incoming.party != null) out.party = incoming.party;
        else if (existingHasApp && existing.party != null) out.party = existing.party;
        else out.party = existing.party != null ? existing.party : incoming.party;
        out.account = incomingIsSms && incoming.account != null ? incoming.account : first(existing.account, incoming.account);
        out.bank = incomingIsSms && incoming.bank != null ? incoming.bank : first(existing.bank, incoming.bank);
        out.balancePaise = incomingIsSms && incoming.balancePaise >= 0 ? incoming.balancePaise
                : existing.balancePaise >= 0 ? existing.balancePaise : incoming.balancePaise;
        out.vpa = first(existing.vpa, incoming.vpa);
        out.ref = first(existing.ref, incoming.ref);
        out.channel = first(existing.channel, incoming.channel);
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
