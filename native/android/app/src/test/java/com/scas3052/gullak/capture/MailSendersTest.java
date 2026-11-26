package com.scas3052.gullak.capture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class MailSendersTest {

    private static final List<String> LISTED = Arrays.asList("slice", "HDFC Bank");

    @Test
    public void aListedNameMatchesWhenItsWordsAppearInTheSender() {
        assertEquals("slice", MailSenders.match("slice", LISTED));
        assertEquals("slice", MailSenders.match("Team slice", LISTED));
        assertEquals("slice", MailSenders.match("SLICE", LISTED));
        assertEquals("slice", MailSenders.match("alerts@slice.bank.in", LISTED));
        assertEquals("HDFC Bank", MailSenders.match("HDFC Bank InstaAlerts", LISTED));
    }

    @Test
    public void everyOtherSenderIsIgnored() {
        assertNull(MailSenders.match("Slicepay Offers", LISTED));
        assertNull(MailSenders.match("Pizza Slices", LISTED));
        assertNull(MailSenders.match("HDFC Life", LISTED));
        assertNull(MailSenders.match("Ravi Kumar", LISTED));
        assertNull(MailSenders.match("", LISTED));
        assertNull(MailSenders.match(null, LISTED));
        assertNull(MailSenders.match("slice", null));
        assertNull(MailSenders.match("slice", Arrays.asList("", "  ", "--")));
    }

    @Test
    public void namesTypedInSettingsAreTidied() {
        assertEquals("HDFC Bank", MailSenders.clean("  HDFC   Bank "));
        assertNull(MailSenders.clean("   "));
        assertNull(MailSenders.clean("@@"));
        assertNull(MailSenders.clean(null));
        StringBuilder longName = new StringBuilder();
        for (int i = 0; i < 20; i++) longName.append("bank ");
        assertTrue(MailSenders.clean(longName.toString()).length() <= MailSenders.MAX_NAME);
    }

    @Test
    public void theSameSenderIgnoresCaseAndPunctuation() {
        assertTrue(MailSenders.same("HDFC Bank", "hdfc  bank"));
        assertTrue(MailSenders.same("slice", "Slice!"));
        assertFalse(MailSenders.same("slice", "Team slice"));
    }
}
