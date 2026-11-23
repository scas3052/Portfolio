package com.scas3052.gullak.capture;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads bank SMS, payment-app notifications and shared text into {@link ParsedPayment}s.
 *
 * <p>No Android imports, so it is unit-tested on the JVM against
 * {@code src/test/resources/payment-fixtures.txt}. The same fixtures drive the JavaScript twin in
 * {@code src/finance/inbox/parse.js}; a rule changed here has to change there too. Unknown formats are
 * skipped, never guessed.
 */
public final class PaymentParser {

    static final String KIND_SMS = "sms";
    static final String KIND_APP = "app";
    static final String KIND_SHARE = "share";

    private static final int I = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;

    private static final Pattern SPACES = Pattern.compile(
            "[\\s\\u00a0\\u1680\\u2000-\\u200b\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+");

    private static final Pattern AMOUNT = Pattern.compile(
            "(?:\\brs\\.?|\\binr|\u20B9)\\s?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", I);
    private static final Pattern BARE_AMOUNT = Pattern.compile(
            "\\b(?:debited|credited|deducted|withdrawn)\\s+(?:by|for|with|of)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\b", I);
    private static final Pattern LIMIT_BEFORE = Pattern.compile("(?:\\blimit|\\blmt)\\b[^0-9]{0,6}$");
    private static final Pattern DUE_BEFORE = Pattern.compile("\\bdue\\b[^0-9]{0,6}$");
    private static final Pattern BALANCE_BEFORE = Pattern.compile("\\b(?:bal|balance|avl|available)\\b[^0-9]{0,12}$");

    private static final Pattern DEBIT = Pattern.compile(
            "\\b(?:debited|debit(?!\\s*card)|spent|withdrawn|withdrawal|deducted|sent|paid|purchased?|transferred|charged|used (?:at|for|on))\\b", I);
    private static final Pattern CREDIT = Pattern.compile(
            "\\b(?:(?:paid|sent) you|credited|received|deposited|refunded|refund|reversed|reversal|added)\\b", I);

    private static final Pattern OTP_MESSAGE = Pattern.compile(
            "\\b(?:is|as) (?:the |your )?otp\\b|\\botp (?:is|for|to)\\b|\\buse (?:the )?otp\\b", I);
    private static final Pattern FUTURE = Pattern.compile(
            "\\bwill be (?:debited|deducted|credited|charged|auto ?debited)\\b|\\bis due\\b|\\bdue (?:date|on|by)\\b"
                    + "|\\b(?:min|minimum|total) (?:amt|amount) due\\b|\\bstatement (?:is |has been )?generated\\b"
                    + "|\\bscheduled\\b|\\breminder\\b|\\bupcoming\\b", I);
    private static final Pattern REQUEST = Pattern.compile("\\brequested\\b|\\brequesting\\b|\\bcollect request\\b", I);
    private static final Pattern FAILED = Pattern.compile(
            "\\b(?:failed|declined|unsuccessful|could not be processed|not processed|insufficient (?:funds|balance)|rejected)\\b", I);
    private static final Pattern MANDATE_SETUP = Pattern.compile(
            "\\bmandate\\b.*\\b(?:created|registered|set ?up|modified|revoked|cancell?ed|paused|activated)\\b"
                    + "|\\b(?:creat|register|approv)\\w*\\b.*\\bmandate\\b", I);
    private static final Pattern PROMO = Pattern.compile(
            "\\b(?:won|win|scratch card|rewards?|offers?|get up to|cashback up to|upto|apply now|pre-?approved|eligible|congratulations|hurry)\\b", I);

    private static final Pattern ACCOUNT = Pattern.compile(
            "\\b(?:a/?c|acct|account|ac|card)\\b\\.?(?:\\s*(?:no|number|num)\\b\\.?)?(?:\\s*(?:ending(?:\\s+(?:with|in))?|ends?))?"
                    + "\\s*[:-]?\\s*(?:[x*\u2022.]+\\s?)?(\\d{3,18})\\b", I);
    private static final Pattern APP_ACCOUNT = Pattern.compile("\\b(?:bank|a/c|account)\\b[^0-9a-z]{0,6}(\\d{4})\\b", I);
    private static final Pattern APP_ACCOUNT_LOOSE = Pattern.compile("[-\u2013\u2014\u2022\u00B7*]\\s*(\\d{4})\\b");

    private static final Pattern VPA = Pattern.compile(
            "\\b([a-z0-9][a-z0-9._-]{0,63}@[a-z][a-z0-9]{1,30})\\b(?![.][a-z])", I);
    private static final Pattern VPA_AT_START = Pattern.compile(
            "^(?:vpa\\s+)?([a-z0-9][a-z0-9._-]{0,63}@[a-z][a-z0-9]{1,30})\\b(?![.][a-z])", I);
    private static final Pattern REF = Pattern.compile(
            "\\b(?:upi\\s*ref(?:erence)?|ref(?:erence)?|rrn|utr|txn|transaction|refno)\\.?\\s*(?:no\\.?|number|id)?\\s*[:#-]?\\s*"
                    + "([a-z0-9]*\\d[a-z0-9]{5,24})\\b|\\bupi\\s*[:#-]\\s*(\\d{6,24})\\b", I);

    private static final Pattern NAME = Pattern.compile(
            "^(?:vpa\\s+)?(.+?)(?=\\s+(?:on|ref|refno|upi|via|from|for|at|avl|bal|not you|if not|has|is|was|in your|using|with"
                    + "|successfully|dated|txn|info|thru|through)\\b|\\s*[.(),;|?\u00B7]|\\s*$)", I);
    private static final Pattern UPI_SLASH = Pattern.compile(
            "\\bupi/[a-z0-9]{2,4}/(\\d{6,})/(.+?)(?=/|\\s+not you\\b|\\s+axis\\b|\\s*$)", I);
    private static final Pattern ICICI_PAYEE = Pattern.compile(";\\s*([a-z0-9&.' -]{2,40}?)\\s+credited\\b", I);
    private static final Pattern AFTER_DATE = Pattern.compile("\\bon\\s+\\d{1,2}[-/ ]?[a-z]{3}[-/ ]?\\d{2,4}\\s+on\\s+", I);
    private static final Pattern PAID_YOU = Pattern.compile("^(.+?)\\s+(?:paid|sent)\\s+you\\b", I);
    private static final Pattern TO = Pattern.compile("\\bto\\s+", I);
    private static final Pattern AT = Pattern.compile("\\bat\\s+", I);
    private static final Pattern TOWARDS = Pattern.compile("\\btowards\\s+", I);
    private static final Pattern BY_FROM = Pattern.compile("\\b(?:by|from)\\s+", I);
    private static final Pattern INFO = Pattern.compile(
            "\\b(?:info|for|towards)\\s*[:-]?\\s*(?=(?:neft|imps|rtgs|upi|nach|ach|ecs)\\b)", I);
    private static final Pattern SEGMENT_SPLIT = Pattern.compile("\\s*[.\u00B7|]\\s+");

    private static final Pattern NOT_A_NAME = Pattern.compile(
            "\\b(?:a/?c|acct|account|card|your|yours|you|bank a/c|customer)\\b", I);
    private static final Pattern STARTS_WITH_MONEY = Pattern.compile("^(?:rs\\.?|inr|\u20B9|rupees?)\\s?[0-9]", I);
    private static final Pattern MONEYISH = Pattern.compile("^(?:rs\\.?|inr|\u20B9)?\\s*[\\d,]+(?:\\.\\d+)?$", I);
    private static final Pattern URLISH = Pattern.compile("https?:|www\\.|\\.com\\b|\\.in\\b", I);
    private static final Pattern PHONE = Pattern.compile("^\\+?\\d[\\d\\s-]{6,}$");
    private static final Pattern HAS_LETTER = Pattern.compile("[a-z]", I);
    private static final Pattern IFSC = Pattern.compile("\\b[a-z]{4}0[a-z0-9]{6}\\b-?", I);
    private static final Pattern RAIL_PREFIX = Pattern.compile(
            "^(?:neft|imps|rtgs|nach|ach|ecs|upi)\\b(?:[\\s-]*(?:cr|dr|in|out)\\b)?[\\s:/-]*", I);
    private static final Pattern MANDATE_PREFIX = Pattern.compile("^(?:upi\\s*)?(?:mandate|autopay|auto pay|si)\\b\\s*", I);
    private static final Pattern EDGE_PUNCT = Pattern.compile("^[\\s\\-/:.,]+|[\\s\\-/:.,]+$");
    private static final Pattern CARD_PHRASE = Pattern.compile("\\b(?:credit|debit)\\s+card\\b");

    private static final Pattern UPI_WORD = Pattern.compile("\\bupi\\b");
    private static final Pattern ATM_WORDS = Pattern.compile("\\batm\\b|\\bwithdrawn\\b|\\bwithdrawal\\b");
    private static final Pattern CARD_WORD = Pattern.compile("\\bcard\\b");
    private static final Pattern NETBANKING_WORDS = Pattern.compile("\\b(?:neft|imps|rtgs|net ?banking|nb)\\b");

    private static final Pattern SENDER_PROMO = Pattern.compile("-P$");
    private static final Pattern SENDER_PHONE = Pattern.compile("^\\+?\\d{7,}$");
    private static final Pattern SENDER_DLT = Pattern.compile("^[A-Z]{2}-[A-Z0-9]{3,9}(?:-[STG])?$");
    private static final Pattern SENDER_BARE = Pattern.compile("^[A-Z0-9]{3,9}$");
    private static final Pattern SENDER_LETTER = Pattern.compile("[A-Z]");
    private static final Pattern SENDER_SHORTCODE = Pattern.compile("^\\d{3,6}$");

    // Sender ids carry a bank code (VM-HDFCBK-S, JD-SBIUPI-S, BP-BOBTXN); message text only counts the
    // unambiguous names, so "Reply YES" isn't Yes Bank.
    private static final String[][] SENDER_BANKS = {
        {"HDFC", "HDFC Bank"}, {"SBI", "SBI"}, {"ICICI", "ICICI Bank"}, {"AXIS", "Axis Bank"}, {"KOTAK", "Kotak"},
        {"BOB", "Bank of Baroda"}, {"BARODA", "Bank of Baroda"}, {"PNB", "PNB"}, {"YESBNK", "Yes Bank"},
        {"IDFC", "IDFC First"}, {"INDUS", "IndusInd"}, {"CANBNK", "Canara Bank"}, {"CANARA", "Canara Bank"},
        {"UNIONB", "Union Bank"}, {"FEDBNK", "Federal Bank"}, {"AUBANK", "AU Bank"}, {"IDBI", "IDBI"},
        {"RBLBNK", "RBL"}, {"PAYTM", "Paytm Bank"}, {"AIRBNK", "Airtel Bank"},
    };
    private static final String[][] TEXT_BANKS = {
        {"hdfc", "HDFC Bank"}, {"sbi", "SBI"}, {"icici", "ICICI Bank"}, {"axis", "Axis Bank"}, {"kotak", "Kotak"},
        {"pnb", "PNB"}, {"idfc", "IDFC First"}, {"idbi", "IDBI"}, {"indusind", "IndusInd"}, {"canara", "Canara Bank"},
        {"federal", "Federal Bank"}, {"baroda", "Bank of Baroda"},
    };
    private static final Pattern TEXT_BANK = Pattern.compile(
            "\\b(hdfc|sbi|icici|axis|kotak|pnb|idfc|idbi|indusind|canara|federal|baroda)\\b", I);

    private PaymentParser() {}

    /** One line of plain text: every run of whitespace (including line breaks) becomes one space. */
    public static String normalize(String text) {
        if (text == null) return "";
        return SPACES.matcher(text).replaceAll(" ").trim();
    }

    /** A bank SMS from {@code sender}, or null when it isn't a completed payment (OTPs, offers, reminders, failures). */
    public static ParsedPayment parseSms(String sender, String body) {
        if (!isTransactionalSender(sender)) return null;
        ParsedPayment parsed = parseText(body, KIND_SMS);
        if (parsed == null) return null;
        String bank = bankFromSender(sender);
        return bank != null ? parsed.withBank(bank) : parsed;
    }

    /** A GPay, PhonePe or Paytm notification. */
    public static ParsedPayment parseApp(String title, String text) {
        String a = normalize(title);
        String b = normalize(text);
        String joined = a.isEmpty() ? b : b.isEmpty() ? a : a + ". " + b;
        return parseText(joined, KIND_APP);
    }

    /** Text shared to Gullak. The user picked it, so a lone amount is enough: it's read as money out. */
    public static ParsedPayment parseShared(String text) {
        ParsedPayment strict = parseText(text, KIND_SHARE);
        if (strict != null) return strict;
        String t = normalize(text);
        if (t.isEmpty() || skipped(t, KIND_SHARE)) return null;
        long[] found = amounts(t);
        if (found[0] < 0) return null;
        Matcher vpa = VPA.matcher(t);
        boolean hasVpa = vpa.find();
        String direction = directionOf(t.toLowerCase(Locale.ROOT));
        return new ParsedPayment(found[0], direction != null ? direction : ParsedPayment.OUT, accountIn(t, KIND_SHARE), null,
                hasVpa ? vpa.group(1).toLowerCase(Locale.ROOT) : null, refIn(t), hasVpa ? "upi" : null, bankInText(t), -1);
    }

    /** True for bank-style sender ids (VM-HDFCBK-S, HDFCBK, 57575); false for phone numbers and -P promotions. */
    public static boolean isTransactionalSender(String sender) {
        String id = sender == null ? "" : sender.trim().toUpperCase(Locale.ROOT);
        if (id.isEmpty() || SENDER_PROMO.matcher(id).find()) return false;
        if (SENDER_PHONE.matcher(id.replaceAll("[\\s-]", "")).find()) return false;
        return SENDER_DLT.matcher(id).find()
                || (SENDER_BARE.matcher(id).find() && SENDER_LETTER.matcher(id).find())
                || SENDER_SHORTCODE.matcher(id).find();
    }

    /** "HDFC Bank" for VM-HDFCBK-S, or null when the sender id doesn't carry a bank code we know. */
    public static String bankFromSender(String sender) {
        if (sender == null) return null;
        String core = sender.trim().toUpperCase(Locale.ROOT).replaceFirst("^[A-Z]{2}-", "").replaceFirst("-[STG]$", "");
        for (String[] bank : SENDER_BANKS) {
            if (core.contains(bank[0])) return bank[1];
        }
        return null;
    }

    /** The bank a message names ("Paid from HDFC Bank •• 1234"), or null. */
    public static String bankInText(String text) {
        if (text == null) return null;
        Matcher m = TEXT_BANK.matcher(text);
        if (!m.find()) return null;
        String key = m.group(1).toLowerCase(Locale.ROOT);
        for (String[] bank : TEXT_BANKS) {
            if (bank[0].equals(key)) return bank[1];
        }
        return null;
    }

    /** Tidies a captured name: NEFT/IMPS prefixes, IFSC codes and mandate words go, so "NEFT Cr-ICIC0000001-ACME" reads "ACME". */
    public static String tidyName(String raw) {
        String name = normalize(raw);
        name = IFSC.matcher(name).replaceAll("");
        name = RAIL_PREFIX.matcher(name).replaceFirst("");
        name = MANDATE_PREFIX.matcher(name).replaceFirst("");
        name = EDGE_PUNCT.matcher(name).replaceAll("");
        return name.length() > 60 ? name.substring(0, 60) : name;
    }

    // ---------------------------------------------------------------------------------------------

    private static ParsedPayment parseText(String raw, String kind) {
        String t = normalize(raw);
        if (t.isEmpty() || skipped(t, kind)) return null;
        String cleaned = CARD_PHRASE.matcher(t.toLowerCase(Locale.ROOT)).replaceAll("card");
        String direction = directionOf(cleaned);
        if (direction == null) return null;
        long[] found = amounts(t);
        long amount = found[0];
        if (amount < 0) return null;
        Matcher vpaMatch = VPA.matcher(t);
        boolean hasVpa = vpaMatch.find();
        String channel = channelOf(cleaned, hasVpa, kind);
        Party party = partyOf(t, direction, channel, kind);
        String vpa = party.vpa != null ? party.vpa : party.name != null ? null : hasVpa ? vpaMatch.group(1) : null;
        String ref = party.ref != null ? party.ref : refIn(t);
        return new ParsedPayment(amount, direction, accountIn(t, kind), party.name,
                vpa != null ? vpa.toLowerCase(Locale.ROOT) : null, ref, channel, bankInText(t), found[1]);
    }

    private static boolean skipped(String t, String kind) {
        if (OTP_MESSAGE.matcher(t).find() || FUTURE.matcher(t).find() || REQUEST.matcher(t).find()
                || FAILED.matcher(t).find() || MANDATE_SETUP.matcher(t).find()) {
            return true;
        }
        return KIND_APP.equals(kind) && PROMO.matcher(t).find();
    }

    /** {amount, balance} in paise; -1 where the message has none. Limits and dues are never the amount. */
    private static long[] amounts(String t) {
        long amount = -1;
        long balance = -1;
        Matcher m = AMOUNT.matcher(t);
        while (m.find()) {
            long value = toPaise(m.group(1));
            if (value < 0) continue;
            String before = t.substring(Math.max(0, m.start() - 24), m.start()).toLowerCase(Locale.ROOT);
            if (LIMIT_BEFORE.matcher(before).find() || DUE_BEFORE.matcher(before).find()) continue;
            if (BALANCE_BEFORE.matcher(before).find()) {
                if (balance < 0) balance = value;
                continue;
            }
            if (amount < 0) amount = value;
        }
        if (amount < 0) {
            Matcher bare = BARE_AMOUNT.matcher(t);
            if (bare.find()) amount = toPaise(bare.group(1));
        }
        return new long[] {amount, balance};
    }

    static long toPaise(String raw) {
        String s = raw.replace(",", "");
        if (s.endsWith(".")) s = s.substring(0, s.length() - 1);
        double value;
        try {
            value = Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return -1;
        }
        if (!(value > 0) || value >= 1e9) return -1;
        return Math.round(value * 100);
    }

    private static int firstIndex(Pattern pattern, String text) {
        Matcher m = pattern.matcher(text);
        return m.find() ? m.start() : -1;
    }

    /** Whichever kind of verb comes first wins ("debited … SWIGGY credited" is money out). */
    private static String directionOf(String cleaned) {
        int debit = firstIndex(DEBIT, cleaned);
        int credit = firstIndex(CREDIT, cleaned);
        if (debit < 0 && credit < 0) return null;
        if (credit < 0) return ParsedPayment.OUT;
        if (debit < 0) return ParsedPayment.IN;
        return credit <= debit ? ParsedPayment.IN : ParsedPayment.OUT;
    }

    private static String channelOf(String cleaned, boolean hasVpa, String kind) {
        if (hasVpa || KIND_APP.equals(kind) || UPI_WORD.matcher(cleaned).find()) return "upi";
        if (ATM_WORDS.matcher(cleaned).find()) return "atm";
        if (CARD_WORD.matcher(cleaned).find()) return "card";
        if (NETBANKING_WORDS.matcher(cleaned).find()) return "netbanking";
        return null;
    }

    private static String accountIn(String t, String kind) {
        Matcher m = ACCOUNT.matcher(t);
        boolean found = m.find();
        if (!found && !KIND_SMS.equals(kind)) {
            m = APP_ACCOUNT.matcher(t);
            found = m.find();
            if (!found) {
                m = APP_ACCOUNT_LOOSE.matcher(t);
                found = m.find();
            }
        }
        if (!found) return null;
        String digits = m.group(1);
        return digits.length() > 4 ? digits.substring(digits.length() - 4) : digits;
    }

    private static String refIn(String t) {
        Matcher m = REF.matcher(t);
        if (!m.find()) return null;
        return m.group(1) != null ? m.group(1) : m.group(2);
    }

    private static boolean validName(String name) {
        if (name == null || name.length() < 2 || !HAS_LETTER.matcher(name).find()) return false;
        if (NOT_A_NAME.matcher(name).find() || MONEYISH.matcher(name).find() || URLISH.matcher(name).find()) return false;
        return !PHONE.matcher(name).find();
    }

    private static final class Party {
        final String name;
        final String vpa;
        final String ref;

        Party(String name, String vpa, String ref) {
            this.name = name;
            this.vpa = vpa;
            this.ref = ref;
        }

        static final Party NONE = new Party(null, null, null);
    }

    /** The name (or VPA) right after each match of {@code keyword}; the first one that reads like a name wins. */
    private static Party after(Pattern keyword, String t) {
        Matcher m = keyword.matcher(t);
        while (m.find()) {
            String rest = t.substring(m.end());
            if (STARTS_WITH_MONEY.matcher(rest).find()) continue;
            Matcher vpa = VPA_AT_START.matcher(rest);
            if (vpa.find()) return new Party(null, vpa.group(1), null);
            Matcher name = NAME.matcher(rest);
            String tidy = name.find() ? tidyName(name.group(1)) : "";
            if (validName(tidy)) return new Party(tidy, null, null);
        }
        return null;
    }

    private static Party partyOf(String t, String direction, String channel, String kind) {
        if ("atm".equals(channel)) return new Party("ATM", null, null);
        Matcher slash = UPI_SLASH.matcher(t);
        if (slash.find()) {
            String name = tidyName(slash.group(2));
            if (validName(name)) return new Party(name, null, slash.group(1));
        }
        if (ParsedPayment.OUT.equals(direction)) {
            Matcher icici = ICICI_PAYEE.matcher(t);
            if (icici.find()) {
                String name = tidyName(icici.group(1));
                if (validName(name)) return new Party(name, null, null);
            }
            Pattern[] order = "card".equals(channel)
                    ? new Pattern[] {AT, AFTER_DATE, TO, TOWARDS, INFO}
                    : new Pattern[] {TO, AT, AFTER_DATE, TOWARDS, INFO};
            for (Pattern keyword : order) {
                Party hit = after(keyword, t);
                if (hit != null) return hit;
            }
            return Party.NONE;
        }
        if (!KIND_SMS.equals(kind)) {
            for (String segment : SEGMENT_SPLIT.split(t)) {
                Matcher paidYou = PAID_YOU.matcher(segment);
                if (paidYou.find()) {
                    String name = tidyName(paidYou.group(1));
                    if (validName(name)) return new Party(name, null, null);
                }
            }
        }
        Party hit = after(BY_FROM, t);
        if (hit == null) hit = after(INFO, t);
        return hit != null ? hit : Party.NONE;
    }

    /** "₹1,23,456" or "₹1,250.50": Indian digit grouping, paise only when there are some. */
    public static String formatRupees(long paise) {
        long rupees = Math.abs(paise) / 100;
        long rest = Math.abs(paise) % 100;
        String digits = Long.toString(rupees);
        StringBuilder grouped = new StringBuilder();
        int len = digits.length();
        if (len <= 3) {
            grouped.append(digits);
        } else {
            String head = digits.substring(0, len - 3);
            String tail = digits.substring(len - 3);
            StringBuilder h = new StringBuilder();
            for (int i = 0; i < head.length(); i++) {
                if (i > 0 && (head.length() - i) % 2 == 0) h.append(',');
                h.append(head.charAt(i));
            }
            grouped.append(h).append(',').append(tail);
        }
        String sign = paise < 0 ? "-" : "";
        String fraction = rest == 0 ? "" : String.format(Locale.ROOT, ".%02d", rest);
        return sign + "\u20B9" + grouped + fraction;
    }
}
