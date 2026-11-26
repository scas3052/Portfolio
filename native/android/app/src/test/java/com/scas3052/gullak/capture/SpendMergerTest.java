package com.scas3052.gullak.capture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class SpendMergerTest {

    private static final long T0 = 1_763_700_000_000L;
    private static final long MIN = 60_000L;

    private static SpendMerger.Fields spend(long paise, String dir, long at, String source, String ref) {
        SpendMerger.Fields f = new SpendMerger.Fields();
        f.amountPaise = paise;
        f.direction = dir;
        f.at = at;
        f.sources = source;
        f.ref = ref;
        return f;
    }

    @Test
    public void smsAndAppNotificationForTheSamePaymentMerge() {
        List<SpendMerger.Fields> recent = Arrays.asList(spend(50000, "out", T0, "sms", "432112345678"));
        assertEquals(0, SpendMerger.match(recent, spend(50000, "out", T0 + 2 * MIN, "gpay", null)));
    }

    @Test
    public void theSameReferenceMergesEvenFromTheSameSourceKind() {
        List<SpendMerger.Fields> recent = Arrays.asList(spend(50000, "out", T0, "sms", "432112345678"));
        assertEquals(0, SpendMerger.match(recent, spend(50000, "out", T0 + 40 * MIN, "sms", "432112345678")));
    }

    @Test
    public void twoTeasFromTheSameSourceStaySeparate() {
        List<SpendMerger.Fields> recent = Arrays.asList(spend(2000, "out", T0, "sms", null));
        assertEquals(-1, SpendMerger.match(recent, spend(2000, "out", T0 + MIN, "sms", null)));
    }

    @Test
    public void differentAmountsDirectionsRefsOrTimesDoNotMerge() {
        List<SpendMerger.Fields> recent = Arrays.asList(spend(50000, "out", T0, "sms", "111111111111"));
        assertEquals(-1, SpendMerger.match(recent, spend(50100, "out", T0, "gpay", null)));
        assertEquals(-1, SpendMerger.match(recent, spend(50000, "in", T0, "gpay", null)));
        assertEquals(-1, SpendMerger.match(recent, spend(50000, "out", T0, "gpay", "222222222222")));
        assertEquals(-1, SpendMerger.match(recent, spend(50000, "out", T0 + 16 * MIN, "gpay", null)));
    }

    @Test
    public void theClosestCandidateWins() {
        List<SpendMerger.Fields> recent = new ArrayList<>();
        recent.add(spend(50000, "out", T0 - 10 * MIN, "sms", null));
        recent.add(spend(50000, "out", T0 - MIN, "sms", null));
        assertEquals(1, SpendMerger.match(recent, spend(50000, "out", T0, "phonepe", null)));
    }

    @Test
    public void mergedSpendKeepsTheAppsNameAndTheBanksAccount() {
        SpendMerger.Fields sms = spend(50000, "out", T0 + MIN, "sms", "432112345678");
        sms.party = "SWIGGY BANGALORE";
        sms.account = "1234";
        sms.bank = "HDFC Bank";
        sms.balancePaise = 1_000_000;
        SpendMerger.Fields app = spend(50000, "out", T0, "gpay", null);
        app.party = "Swiggy";
        app.account = "9999";

        SpendMerger.Fields smsFirst = SpendMerger.combine(sms, app);
        assertEquals("Swiggy", smsFirst.party);
        assertEquals("1234", smsFirst.account);
        assertEquals("HDFC Bank", smsFirst.bank);
        assertEquals(1_000_000, smsFirst.balancePaise);
        assertEquals("432112345678", smsFirst.ref);
        assertEquals(T0, smsFirst.at);
        assertEquals("sms,gpay", smsFirst.sources);

        SpendMerger.Fields appFirst = SpendMerger.combine(app, sms);
        assertEquals("Swiggy", appFirst.party);
        assertEquals("1234", appFirst.account);
        assertEquals("gpay,sms", appFirst.sources);
    }

    @Test
    public void twoAppsReportingOnePaymentMerge() {
        SpendMerger.Fields gpay = spend(50000, "out", T0, "gpay", null);
        gpay.party = "Swiggy";
        gpay.account = "1234";
        SpendMerger.Fields slice = spend(50000, "out", T0 + MIN, "slice", null);
        slice.account = "234";
        assertEquals(0, SpendMerger.match(Arrays.asList(gpay), slice));
    }

    @Test
    public void theSameAppTwiceIsTwoPayments() {
        List<SpendMerger.Fields> recent = Arrays.asList(spend(2000, "out", T0, "gpay", null));
        assertEquals(-1, SpendMerger.match(recent, spend(2000, "out", T0 + MIN, "gpay", null)));
        List<SpendMerger.Fields> added = Arrays.asList(spend(2000, "out", T0, "com.example.bank", null));
        assertEquals(-1, SpendMerger.match(added, spend(2000, "out", T0 + MIN, "com.example.bank", null)));
    }

    @Test
    public void twoAppsNamingDifferentAccountsOrPayeesStaySeparate() {
        SpendMerger.Fields gpay = spend(2000, "out", T0, "gpay", null);
        gpay.account = "1234";
        gpay.party = "Chai Point";
        SpendMerger.Fields otherAccount = spend(2000, "out", T0 + MIN, "phonepe", null);
        otherAccount.account = "0937";
        assertEquals(-1, SpendMerger.match(Arrays.asList(gpay), otherAccount));
        SpendMerger.Fields otherPayee = spend(2000, "out", T0 + MIN, "phonepe", null);
        otherPayee.party = "Ravi Kumar";
        assertEquals(-1, SpendMerger.match(Arrays.asList(gpay), otherPayee));
        SpendMerger.Fields samePayee = spend(2000, "out", T0 + MIN, "slice", null);
        samePayee.party = "CHAI POINT BLR";
        assertEquals(0, SpendMerger.match(Arrays.asList(gpay), samePayee));
    }

    @Test
    public void statementLinesMatchThatDaysAlertsButNotEachOther() {
        long noon = T0 + 3 * 60 * MIN;
        List<SpendMerger.Fields> recent = Arrays.asList(spend(50000, "out", T0, "sms", null));
        assertEquals(0, SpendMerger.match(recent, spend(50000, "out", noon, "statement", null)));
        List<SpendMerger.Fields> lines = Arrays.asList(spend(2000, "out", noon, "statement", null));
        assertEquals(-1, SpendMerger.match(lines, spend(2000, "out", noon, "statement", null)));
        assertEquals(-1, SpendMerger.match(recent, spend(50000, "out", T0 + 2 * 24 * 60 * MIN, "statement", null)));
    }

    @Test
    public void aBankEmailJoinsTheSameAppAlertOrSmsUpToTwoHoursLater() {
        List<SpendMerger.Fields> recent = Arrays.asList(spend(1000, "out", T0, "gpay", null));
        assertEquals(0, SpendMerger.match(recent, spend(1000, "out", T0 + 40 * MIN, "mail", "632900000843")));
        assertEquals(-1, SpendMerger.match(recent, spend(1000, "out", T0 + 3 * 60 * MIN, "mail", null)));
        List<SpendMerger.Fields> mailFirst = Arrays.asList(spend(1000, "out", T0, "mail", null));
        assertEquals(0, SpendMerger.match(mailFirst, spend(1000, "out", T0 + 90 * MIN, "sms", null)));
    }

    @Test
    public void twoEmailsStaySeparateUnlessTheyShareAReference() {
        List<SpendMerger.Fields> recent = Arrays.asList(spend(1000, "out", T0, "mail", "632900000843"));
        assertEquals(-1, SpendMerger.match(recent, spend(1000, "out", T0 + MIN, "mail", "632900000844")));
        assertEquals(-1, SpendMerger.match(recent, spend(1000, "out", T0 + MIN, "mail", null)));
        assertEquals(0, SpendMerger.match(recent, spend(1000, "out", T0 + MIN, "mail", "632900000843")));
    }

    @Test
    public void anEmailNeverJoinsAPaymentOnAnotherAccountOrBank() {
        SpendMerger.Fields sms = spend(1000, "out", T0, "sms", null);
        sms.account = "4821";
        sms.bank = "HDFC Bank";
        SpendMerger.Fields otherAccount = spend(1000, "out", T0 + MIN, "mail", null);
        otherAccount.account = "4410";
        assertEquals(-1, SpendMerger.match(Arrays.asList(sms), otherAccount));
        SpendMerger.Fields otherBank = spend(1000, "out", T0 + MIN, "mail", null);
        otherBank.bank = "slice";
        assertEquals(-1, SpendMerger.match(Arrays.asList(sms), otherBank));
        SpendMerger.Fields same = spend(1000, "out", T0 + MIN, "mail", null);
        same.account = "4821";
        same.bank = "hdfc bank";
        assertEquals(0, SpendMerger.match(Arrays.asList(sms), same));
    }

    @Test
    public void appsStillNeedTheSamePayeeWhenAnEmailIsAlreadyIn() {
        SpendMerger.Fields both = spend(2000, "out", T0, "gpay,mail", null);
        both.party = "Chai Point";
        SpendMerger.Fields otherPayee = spend(2000, "out", T0 + MIN, "phonepe", null);
        otherPayee.party = "Ravi Kumar";
        assertEquals(-1, SpendMerger.match(Arrays.asList(both), otherPayee));
    }

    @Test
    public void accountsPickedInGullakMustAgree() {
        SpendMerger.Fields line = spend(12000, "out", T0, "statement", null);
        line.accountId = "acc_slice";
        SpendMerger.Fields other = spend(12000, "out", T0, "sms", null);
        other.accountId = "acc_hdfc";
        assertFalse(SpendMerger.compatible(line, other));
        other.accountId = "acc_slice";
        assertTrue(SpendMerger.compatible(line, other));
        other.accountId = null;
        assertTrue(SpendMerger.compatible(line, other));
    }

    @Test
    public void aSecondAppAddsASourceNotANewNameAndTheAccountChoiceIsKept() {
        SpendMerger.Fields gpay = spend(50000, "out", T0, "gpay", null);
        gpay.party = "Swiggy";
        SpendMerger.Fields slice = spend(50000, "out", T0 + MIN, "slice", null);
        slice.party = "SWIGGY LIMITED";
        slice.accountId = "acc_slice";
        SpendMerger.Fields merged = SpendMerger.combine(gpay, slice);
        assertEquals("Swiggy", merged.party);
        assertEquals("acc_slice", merged.accountId);
        assertEquals("gpay,slice", merged.sources);
    }

    @Test
    public void sourcesAreNotRepeated() {
        assertEquals("sms,gpay", SpendMerger.addSource("sms,gpay", "gpay"));
        assertEquals("share", SpendMerger.addSource("", "share"));
    }
}
