package com.scas3052.gullak.capture;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.Test;

/** Runs every case in payment-fixtures.txt, the same file the JavaScript parser is tested with. */
public class PaymentParserTest {

    private static final String[] FIELDS = {"amount", "dir", "account", "party", "vpa", "ref", "channel", "balance"};

    private static final class Fixture {
        final String name;
        final Map<String, String> fields = new LinkedHashMap<>();

        Fixture(String name) {
            this.name = name;
        }
    }

    private static List<Fixture> load() throws IOException {
        InputStream in = PaymentParserTest.class.getClassLoader().getResourceAsStream("payment-fixtures.txt");
        assertNotNull("payment-fixtures.txt is missing from src/test/resources", in);
        List<Fixture> cases = new ArrayList<>();
        Fixture current = null;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty() || line.startsWith("#")) continue;
                if (line.startsWith("== ")) {
                    current = new Fixture(line.substring(3).trim());
                    cases.add(current);
                    continue;
                }
                int colon = line.indexOf(':');
                String key = line.substring(0, colon).trim();
                String value = line.substring(colon + 1).trim();
                if (key.equals("text") || key.equals("title")) value = value.replace("\\n", "\n");
                current.fields.put(key, value);
            }
        }
        return cases;
    }

    private static ParsedPayment run(Map<String, String> f) {
        String kind = f.get("kind");
        if ("sms".equals(kind)) return PaymentParser.parseSms(f.get("from"), f.get("text"));
        if ("app".equals(kind)) return PaymentParser.parseApp(f.get("title"), f.get("text"));
        if ("share".equals(kind)) return PaymentParser.parseShared(f.get("text"));
        throw new IllegalArgumentException("Unknown kind " + kind);
    }

    private static String rupees(long paise) {
        return String.format(Locale.ROOT, "%d.%02d", paise / 100, paise % 100);
    }

    private static String actual(ParsedPayment p, String field) {
        String value;
        switch (field) {
            case "amount": value = rupees(p.amountPaise); break;
            case "dir": value = p.direction; break;
            case "account": value = p.account; break;
            case "party": value = p.party; break;
            case "vpa": value = p.vpa; break;
            case "ref": value = p.ref; break;
            case "channel": value = p.channel; break;
            case "balance": value = p.balancePaise < 0 ? null : rupees(p.balancePaise); break;
            default: throw new IllegalArgumentException(field);
        }
        return value == null ? "-" : value;
    }

    @Test
    public void everyFixtureParsesAsExpected() throws IOException {
        List<Fixture> cases = load();
        assertTrue("expected at least 40 fixtures", cases.size() >= 40);
        StringBuilder failures = new StringBuilder();
        for (Fixture c : cases) {
            ParsedPayment parsed = run(c.fields);
            if ("none".equals(c.fields.get("expect"))) {
                if (parsed != null) failures.append("\n").append(c.name).append(": expected no payment, got ").append(parsed);
                continue;
            }
            if (parsed == null) {
                failures.append("\n").append(c.name).append(": expected a payment, got none");
                continue;
            }
            for (String field : FIELDS) {
                if (!c.fields.containsKey(field)) continue;
                String want = c.fields.get(field);
                String got = actual(parsed, field);
                if (!want.equals(got)) {
                    failures.append("\n").append(c.name).append(": ").append(field).append(" expected <").append(want)
                            .append("> but was <").append(got).append(">");
                }
            }
        }
        if (failures.length() > 0) fail(failures.toString());
    }

    @Test
    public void senderIds() {
        for (String id : new String[] {"VM-HDFCBK-S", "AD-HDFCBK", "JD-SBIUPI-S", "HDFCBK", "57575", "BP-BOBTXN-T"}) {
            assertTrue(id, PaymentParser.isTransactionalSender(id));
        }
        for (String id : new String[] {"AD-HDFCBK-P", "+919876543210", "9876543210", "", null, "VM-HD"}) {
            assertFalse(String.valueOf(id), PaymentParser.isTransactionalSender(id));
        }
    }

    @Test
    public void banks() {
        assertEquals("HDFC Bank", PaymentParser.bankFromSender("VM-HDFCBK-S"));
        assertEquals("SBI", PaymentParser.bankFromSender("JD-SBIUPI-S"));
        assertEquals("Bank of Baroda", PaymentParser.bankFromSender("BP-BOBTXN"));
        assertNull(PaymentParser.bankFromSender("VM-ZZZZZZ"));
        assertEquals("HDFC Bank", PaymentParser.bankInText("Paid from HDFC Bank \u2022\u2022 1234"));
        assertNull(PaymentParser.bankInText("Reply YES to continue"));
        assertEquals("SBI", PaymentParser.parseSms("JD-SBIUPI-S",
                "Dear UPI user A/C X1234 debited by 500.0 on date 21Nov26 trf to SWIGGY Refno 432112345603").bank);
    }

    @Test
    public void tidyNames() {
        assertEquals("ACME CORP PVT LTD", PaymentParser.tidyName("NEFT Cr-ICIC0000001-ACME CORP PVT LTD-"));
        assertEquals("SPOTIFY", PaymentParser.tidyName("UPI mandate SPOTIFY."));
        assertEquals("Blue Tokai", PaymentParser.tidyName("  Blue   Tokai "));
    }

    @Test
    public void amountsMustBeAboveZeroAndBelowHundredCrore() {
        assertNull(PaymentParser.parseSms("VM-HDFCBK", "Rs.0.00 debited from A/c XX1234"));
        assertNull(PaymentParser.parseSms("VM-HDFCBK", "Rs.1,00,00,00,000 debited from A/c XX1234"));
    }

    @Test
    public void rupeesUseIndianGrouping() {
        assertEquals("\u20B9500", PaymentParser.formatRupees(50000));
        assertEquals("\u20B91,250.50", PaymentParser.formatRupees(125050));
        assertEquals("\u20B91,23,456.78", PaymentParser.formatRupees(12345678));
        assertEquals("\u20B912,34,567", PaymentParser.formatRupees(123456700));
    }
}
