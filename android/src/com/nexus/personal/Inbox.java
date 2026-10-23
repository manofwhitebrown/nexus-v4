package com.nexus.personal;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import android.util.Base64;

/** Notes typed into the floating bubble wait here until the web app imports them. */
final class Inbox {
    private static final String FILE = "inbox.json";

    private Inbox() {}

    static synchronized void add(Context c, String text, String kind) {
        try {
            JSONArray a = read(c);
            JSONObject o = new JSONObject();
            o.put("t", text);
            o.put("k", kind);
            o.put("ts", System.currentTimeMillis());
            a.put(o);
            write(c, a);
        } catch (Exception ignored) {
        }
    }

    /** A task ticked off from the widget or a reminder. The web app applies it when it next opens. */
    static synchronized void addDone(Context c, String id) {
        try {
            JSONArray a = read(c);
            JSONObject o = new JSONObject();
            o.put("t", "");
            o.put("k", "done");
            o.put("id", id);
            o.put("ts", System.currentTimeMillis());
            a.put(o);
            write(c, a);
        } catch (Exception ignored) {
        }
    }

    static File mediaDir(Context c) {
        File d = new File(c.getFilesDir(), "inbox_media");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    /** A recording or screenshot saved by the bubble. kind is "voice" or "screenshot". */
    static synchronized void addMedia(Context c, String kind, String fileName, String label) {
        try {
            JSONArray a = read(c);
            JSONObject o = new JSONObject();
            o.put("t", label);
            o.put("k", kind);
            o.put("f", fileName);
            o.put("ts", System.currentTimeMillis());
            a.put(o);
            write(c, a);
        } catch (Exception ignored) {
        }
    }

    /** The file as a data URL for the web app. Empty if it is missing or too large. */
    static String mediaData(Context c, String name) {
        try {
            File f = new File(mediaDir(c), name);
            if (!f.getName().equals(name) || !f.isFile() || f.length() > 25L * 1024 * 1024) return "";
            FileInputStream in = new FileInputStream(f);
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            in.close();
            String mime = name.endsWith(".jpg") ? "image/jpeg" : "audio/mp4";
            return "data:" + mime + ";base64," + Base64.encodeToString(b.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    /** Returns the waiting notes without removing them. The web app calls ack() after saving. */
    static synchronized String peek(Context c) {
        try {
            return read(c).toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    /** Removes the first n notes, the ones the web app has saved. */
    static synchronized void ack(Context c, int n) {
        try {
            JSONArray a = read(c);
            JSONArray rest = new JSONArray();
            for (int i = 0; i < Math.min(n, a.length()); i++) {
                String f = a.getJSONObject(i).optString("f", "");
                if (f.length() > 0) {
                    File m = new File(mediaDir(c), f);
                    if (m.getName().equals(f)) m.delete();
                }
            }
            for (int i = n; i < a.length(); i++) rest.put(a.get(i));
            write(c, rest);
        } catch (Exception ignored) {
        }
    }

    private static JSONArray read(Context c) throws Exception {
        File f = new File(c.getFilesDir(), FILE);
        if (!f.exists()) return new JSONArray();
        FileInputStream in = new FileInputStream(f);
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        in.close();
        String s = b.toString("UTF-8");
        return s.length() == 0 ? new JSONArray() : new JSONArray(s);
    }

    private static void write(Context c, JSONArray a) throws Exception {
        File f = new File(c.getFilesDir(), FILE);
        File t = new File(c.getFilesDir(), FILE + ".tmp");
        FileOutputStream o = new FileOutputStream(t);
        o.write(a.toString().getBytes("UTF-8"));
        o.close();
        if (!t.renameTo(f)) {
            f.delete();
            t.renameTo(f);
        }
    }
}
