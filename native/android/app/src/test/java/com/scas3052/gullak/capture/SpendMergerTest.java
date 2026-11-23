package com.scas3052.gullak.capture;

import static org.junit.Assert.assertEquals;

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
    public void sourcesAreNotRepeated() {
        assertEquals("sms,gpay", SpendMerger.addSource("sms,gpay", "gpay"));
        assertEquals("share", SpendMerger.addSource("", "share"));
    }
}
