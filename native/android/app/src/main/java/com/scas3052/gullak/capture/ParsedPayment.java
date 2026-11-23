package com.scas3052.gullak.capture;

/** What one message said about one payment. Plain Java, so the parser tests run without Android. */
public final class ParsedPayment {

    public static final String OUT = "out";
    public static final String IN = "in";

    /** Amount in paise (₹500.00 is 50000). */
    public final long amountPaise;
    /** {@link #OUT} or {@link #IN}. */
    public final String direction;
    /** Last 3 or 4 digits of the account or card the message names, or null. */
    public final String account;
    /** Merchant or person, as written in the message, or null. */
    public final String party;
    /** UPI id such as swiggy@icici, lower case, or null. */
    public final String vpa;
    /** UPI or bank reference number, or null. */
    public final String ref;
    /** "upi", "card", "atm" or "netbanking", or null. */
    public final String channel;
    /** Bank name, from the sender id or the text, or null. */
    public final String bank;
    /** Available balance after the payment in paise, or -1 when the message doesn't say. */
    public final long balancePaise;

    public ParsedPayment(long amountPaise, String direction, String account, String party, String vpa, String ref,
            String channel, String bank, long balancePaise) {
        this.amountPaise = amountPaise;
        this.direction = direction;
        this.account = account;
        this.party = party;
        this.vpa = vpa;
        this.ref = ref;
        this.channel = channel;
        this.bank = bank;
        this.balancePaise = balancePaise;
    }

    ParsedPayment withBank(String newBank) {
        return new ParsedPayment(amountPaise, direction, account, party, vpa, ref, channel, newBank, balancePaise);
    }

    @Override
    public String toString() {
        return "ParsedPayment{" + amountPaise + " " + direction + ", account=" + account + ", party=" + party
                + ", vpa=" + vpa + ", ref=" + ref + ", channel=" + channel + ", bank=" + bank + ", balance="
                + balancePaise + "}";
    }
}
