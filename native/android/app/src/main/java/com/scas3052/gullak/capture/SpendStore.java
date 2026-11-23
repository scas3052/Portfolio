package com.scas3052.gullak.capture;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The phone's own list of captured payments, and the source of truth for them until they are filed.
 *
 * <p>Raw message text is kept only while a spend is unfiled. A small "seen" table remembers every message
 * already read (as a hash), so catch-up scans never bring back what was filed or dismissed.
 */
public final class SpendStore extends SQLiteOpenHelper {

    public static final String UNFILED = "unfiled";
    public static final String FILED = "filed";
    public static final String DISMISSED = "dismissed";

    private static final String DB_NAME = "gullak_capture.db";
    private static final int DB_VERSION = 1;
    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    private static final long KEEP_CLOSED_MS = 30 * DAY_MS;
    private static final long KEEP_SEEN_MS = 45 * DAY_MS;
    private static final long LIST_CLOSED_MS = 7 * DAY_MS;
    private static final long MATCH_BACK_MS = 3 * DAY_MS;
    private static final long SMS_SEEN_WINDOW_MS = 10 * 60 * 1000L;
    private static final long APP_SEEN_WINDOW_MS = 5 * 60 * 1000L;

    private static final String COLUMNS = "id, status, amount, direction, at, account, party, vpa, ref, channel, bank, balance,"
            + " sources, raw IS NOT NULL AS has_raw, hint, hint_at, entry_ids, created_at, closed_at";

    private static SpendStore instance;
    private static final SecureRandom RANDOM = new SecureRandom();

    public static synchronized SpendStore get(Context context) {
        if (instance == null) instance = new SpendStore(context.getApplicationContext());
        return instance;
    }

    private SpendStore(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE spends (id TEXT PRIMARY KEY, status TEXT NOT NULL, amount INTEGER NOT NULL,"
                + " direction TEXT NOT NULL, at INTEGER NOT NULL, account TEXT, party TEXT, vpa TEXT, ref TEXT, channel TEXT,"
                + " bank TEXT, balance INTEGER NOT NULL DEFAULT -1, sources TEXT NOT NULL, raw TEXT, hint TEXT,"
                + " hint_at INTEGER NOT NULL DEFAULT 0, entry_ids TEXT, created_at INTEGER NOT NULL,"
                + " updated_at INTEGER NOT NULL, closed_at INTEGER NOT NULL DEFAULT 0)");
        db.execSQL("CREATE INDEX spends_status_at ON spends(status, at)");
        db.execSQL("CREATE INDEX spends_amount_at ON spends(amount, at)");
        db.execSQL("CREATE TABLE seen (hash TEXT NOT NULL, at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX seen_hash ON seen(hash)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Version 1 is the first schema.
    }

    /** One captured payment, as stored. */
    public static final class Spend {
        public String id;
        public String status;
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
        public String sources;
        public boolean hasRaw;
        public String hint;
        public long hintAt;
        public String entryIds;
        public long createdAt;
        public long closedAt;

        SpendMerger.Fields fields() {
            SpendMerger.Fields f = new SpendMerger.Fields();
            f.amountPaise = amountPaise;
            f.direction = direction;
            f.at = at;
            f.account = account;
            f.party = party;
            f.vpa = vpa;
            f.ref = ref;
            f.channel = channel;
            f.bank = bank;
            f.balancePaise = balancePaise;
            f.sources = sources;
            return f;
        }
    }

    /** What happened to one incoming message. */
    public static final class Captured {
        public final Spend spend;
        public final boolean isNew;
        public final boolean duplicate;

        Captured(Spend spend, boolean isNew, boolean duplicate) {
            this.spend = spend;
            this.isNew = isNew;
            this.duplicate = duplicate;
        }
    }

    /**
     * Stores one parsed message: a new spend, or folded into the spend it duplicates. Returns a duplicate
     * marker when this exact message was already read (a re-scan, or the same notification posted twice).
     */
    public synchronized Captured capture(ParsedPayment p, String source, String sender, String text, long at, long now) {
        SQLiteDatabase db = getWritableDatabase();
        String hash = sha1(source + "|" + (sender == null ? "" : sender.trim().toUpperCase(Locale.ROOT)) + "|" + PaymentParser.normalize(text));
        long window = SpendMerger.KIND_SMS.equals(source) ? SMS_SEEN_WINDOW_MS : APP_SEEN_WINDOW_MS;
        if (seenNear(db, hash, at, window)) return new Captured(null, false, true);

        db.beginTransaction();
        try {
            ContentValues seen = new ContentValues();
            seen.put("hash", hash);
            seen.put("at", at);
            db.insert("seen", null, seen);

            List<Spend> recent = query(db, "amount = ? AND direction = ? AND at > ?",
                    new String[] {Long.toString(p.amountPaise), p.direction, Long.toString(at - MATCH_BACK_MS)}, "at DESC");
            List<SpendMerger.Fields> candidates = new ArrayList<>();
            for (Spend s : recent) candidates.add(s.fields());
            SpendMerger.Fields incoming = SpendMerger.Fields.of(p, at, source);
            int index = SpendMerger.match(candidates, incoming);

            Spend result;
            boolean isNew;
            if (index >= 0) {
                Spend existing = recent.get(index);
                SpendMerger.Fields merged = SpendMerger.combine(existing.fields(), incoming);
                ContentValues v = fieldValues(merged);
                v.put("updated_at", now);
                // Raw text is only kept while the spend waits to be filed.
                if (UNFILED.equals(existing.status)) v.put("raw", appendRaw(rawOf(db, existing.id), source, sender, text, at));
                db.update("spends", v, "id = ?", new String[] {existing.id});
                result = byId(db, existing.id);
                isNew = false;
            } else {
                String id = newId();
                ContentValues v = fieldValues(incoming);
                v.put("id", id);
                v.put("status", UNFILED);
                v.put("raw", appendRaw(null, source, sender, text, at));
                v.put("created_at", now);
                v.put("updated_at", now);
                db.insert("spends", null, v);
                result = byId(db, id);
                isNew = true;
            }
            db.setTransactionSuccessful();
            return new Captured(result, isNew, false);
        } finally {
            db.endTransaction();
        }
    }

    /** Unfiled spends, newest first, plus those filed or dismissed in the last week (so Undo can find them). */
    public synchronized List<Spend> list(long now) {
        return query(getReadableDatabase(), "status = ? OR closed_at > ?",
                new String[] {UNFILED, Long.toString(now - LIST_CLOSED_MS)}, "at DESC");
    }

    public synchronized Spend get(String id) {
        return byId(getReadableDatabase(), id);
    }

    public synchronized int unfiledCount() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM spends WHERE status = ?", new String[] {UNFILED})) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    /** The original messages, as JSON: [{source, sender, text, at}]. Null once the spend is filed or dismissed. */
    public synchronized String original(String id) {
        return rawOf(getReadableDatabase(), id);
    }

    public synchronized boolean markFiled(String id, String entryIds, long now) {
        ContentValues v = new ContentValues();
        v.put("status", FILED);
        v.put("entry_ids", entryIds);
        v.putNull("raw");
        v.put("closed_at", now);
        v.put("updated_at", now);
        return getWritableDatabase().update("spends", v, "id = ?", new String[] {id}) > 0;
    }

    public synchronized boolean dismiss(String id, long now) {
        ContentValues v = new ContentValues();
        v.put("status", DISMISSED);
        v.putNull("raw");
        v.put("closed_at", now);
        v.put("updated_at", now);
        return getWritableDatabase().update("spends", v, "id = ?", new String[] {id}) > 0;
    }

    /** Puts a filed or dismissed spend back in the list (Undo). Its original text is gone for good. */
    public synchronized boolean restore(String id, long now) {
        ContentValues v = new ContentValues();
        v.put("status", UNFILED);
        v.putNull("entry_ids");
        v.put("closed_at", 0);
        v.put("updated_at", now);
        return getWritableDatabase().update("spends", v, "id = ?", new String[] {id}) > 0;
    }

    public synchronized boolean setHint(String id, String hint, long now) {
        ContentValues v = new ContentValues();
        String clean = hint == null ? "" : PaymentParser.normalize(hint);
        if (clean.length() > 200) clean = clean.substring(0, 200);
        if (clean.isEmpty()) {
            v.putNull("hint");
            v.put("hint_at", 0);
        } else {
            v.put("hint", clean);
            v.put("hint_at", now);
        }
        v.put("updated_at", now);
        return getWritableDatabase().update("spends", v, "id = ?", new String[] {id}) > 0;
    }

    /** Forgets spends closed over a month ago and message hashes older than 45 days. */
    public synchronized void prune(long now) {
        SQLiteDatabase db = getWritableDatabase();
        db.delete("spends", "status != ? AND closed_at > 0 AND closed_at < ?", new String[] {UNFILED, Long.toString(now - KEEP_CLOSED_MS)});
        db.delete("seen", "at < ?", new String[] {Long.toString(now - KEEP_SEEN_MS)});
    }

    // ---------------------------------------------------------------------------------------------

    private static boolean seenNear(SQLiteDatabase db, String hash, long at, long window) {
        try (Cursor c = db.rawQuery("SELECT 1 FROM seen WHERE hash = ? AND at > ? AND at < ? LIMIT 1",
                new String[] {hash, Long.toString(at - window), Long.toString(at + window)})) {
            return c.moveToFirst();
        }
    }

    private static ContentValues fieldValues(SpendMerger.Fields f) {
        ContentValues v = new ContentValues();
        v.put("amount", f.amountPaise);
        v.put("direction", f.direction);
        v.put("at", f.at);
        v.put("account", f.account);
        v.put("party", f.party);
        v.put("vpa", f.vpa);
        v.put("ref", f.ref);
        v.put("channel", f.channel);
        v.put("bank", f.bank);
        v.put("balance", f.balancePaise);
        v.put("sources", f.sources);
        return v;
    }

    private static String appendRaw(String existing, String source, String sender, String text, long at) {
        JSONArray list;
        try {
            list = existing == null ? new JSONArray() : new JSONArray(existing);
        } catch (JSONException e) {
            list = new JSONArray();
        }
        try {
            JSONObject item = new JSONObject();
            item.put("source", source);
            item.put("sender", sender == null ? "" : sender);
            item.put("text", text == null ? "" : text);
            item.put("at", at);
            list.put(item);
        } catch (JSONException e) {
            // org.json only throws for non-finite numbers; nothing here is one.
        }
        return list.toString();
    }

    private static String rawOf(SQLiteDatabase db, String id) {
        try (Cursor c = db.rawQuery("SELECT raw FROM spends WHERE id = ?", new String[] {id})) {
            return c.moveToFirst() && !c.isNull(0) ? c.getString(0) : null;
        }
    }

    private static Spend byId(SQLiteDatabase db, String id) {
        List<Spend> found = query(db, "id = ?", new String[] {id}, null);
        return found.isEmpty() ? null : found.get(0);
    }

    private static List<Spend> query(SQLiteDatabase db, String where, String[] args, String order) {
        List<Spend> out = new ArrayList<>();
        String sql = "SELECT " + COLUMNS + " FROM spends WHERE " + where + (order != null ? " ORDER BY " + order : "");
        try (Cursor c = db.rawQuery(sql, args)) {
            while (c.moveToNext()) {
                Spend s = new Spend();
                s.id = c.getString(0);
                s.status = c.getString(1);
                s.amountPaise = c.getLong(2);
                s.direction = c.getString(3);
                s.at = c.getLong(4);
                s.account = c.isNull(5) ? null : c.getString(5);
                s.party = c.isNull(6) ? null : c.getString(6);
                s.vpa = c.isNull(7) ? null : c.getString(7);
                s.ref = c.isNull(8) ? null : c.getString(8);
                s.channel = c.isNull(9) ? null : c.getString(9);
                s.bank = c.isNull(10) ? null : c.getString(10);
                s.balancePaise = c.getLong(11);
                s.sources = c.getString(12);
                s.hasRaw = c.getInt(13) != 0;
                s.hint = c.isNull(14) ? null : c.getString(14);
                s.hintAt = c.getLong(15);
                s.entryIds = c.isNull(16) ? null : c.getString(16);
                s.createdAt = c.getLong(17);
                s.closedAt = c.getLong(18);
                out.add(s);
            }
        }
        return out;
    }

    private static String newId() {
        byte[] bytes = new byte[8];
        RANDOM.nextBytes(bytes);
        StringBuilder sb = new StringBuilder("sp_");
        for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }

    static String sha1(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format(Locale.ROOT, "%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return Integer.toHexString(text.hashCode());
        }
    }
}
