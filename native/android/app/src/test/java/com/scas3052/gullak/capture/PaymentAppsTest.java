package com.scas3052.gullak.capture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

public class PaymentAppsTest {

    @Test
    public void builtInAppsKeepTheirShortSourceNames() {
        assertEquals("gpay", PaymentApps.sourceFor("com.google.android.apps.nbu.paisa.user", null));
        assertEquals("phonepe", PaymentApps.sourceFor("com.phonepe.app", null));
        assertEquals("paytm", PaymentApps.sourceFor("net.one97.paytm", null));
        assertEquals("slice", PaymentApps.sourceFor("indwin.c3.shareapp", Collections.emptySet()));
    }

    @Test
    public void addedAppsAreReadUnderTheirPackageNameAndEveryOtherAppIsIgnored() {
        Set<String> added = new HashSet<>(Arrays.asList("com.example.bank"));
        assertEquals("com.example.bank", PaymentApps.sourceFor("com.example.bank", added));
        assertNull(PaymentApps.sourceFor("com.whatsapp", added));
        assertNull(PaymentApps.sourceFor(null, added));
        assertNull(PaymentApps.sourceFor("", added));
    }

    @Test
    public void onlyRealOtherPackagesCanBeAdded() {
        assertTrue(PaymentApps.addable("com.example.bank", "com.scas3052.gullak"));
        assertFalse(PaymentApps.addable("com.scas3052.gullak", "com.scas3052.gullak"));
        assertFalse(PaymentApps.addable("com.phonepe.app", "com.scas3052.gullak"));
        assertFalse(PaymentApps.addable("not a package", "com.scas3052.gullak"));
        assertFalse(PaymentApps.addable(null, "com.scas3052.gullak"));
    }

    @Test
    public void sourceNamesAndPackagesAreUniqueAndNeverClashWithOtherSources() {
        Set<String> sources = new HashSet<>();
        Set<String> packages = new HashSet<>();
        for (PaymentApps.App app : PaymentApps.BUILT_IN) {
            assertTrue(app.source, sources.add(app.source));
            assertTrue(app.packageName, packages.add(app.packageName));
            assertEquals(SpendMerger.KIND_APP, SpendMerger.kindOf(app.source));
            assertEquals(app, PaymentApps.bySource(app.source));
        }
    }
}
