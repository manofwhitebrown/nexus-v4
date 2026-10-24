package com.nexus.personal;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

/** The few tasks the home-screen widget shows. The web app refreshes this whenever its data changes. */
final class Snap {
    private Snap() {}

    static JSONArray read(Context c) {
        try {
            return new JSONArray(c.getSharedPreferences("nexus", 0).getString("snap", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void write(Context c, String json) {
        try {
            JSONArray a = new JSONArray(json);
            JSONArray out = new JSONArray();
            for (int i = 0; i < a.length() && i < 6; i++) {
                JSONObject o = a.getJSONObject(i);
                JSONObject s = new JSONObject();
                s.put("id", o.optString("id"));
                s.put("t", o.optString("t"));
                s.put("d", o.optString("d"));
                if (o.optString("s").length() > 0) s.put("s", o.optString("s")); // a step row
                out.put(s);
            }
            c.getSharedPreferences("nexus", 0).edit().putString("snap", out.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** Takes a task off the widget straight away, before the web app has processed the tick. */
    static void remove(Context c, String id) {
        remove(c, id, "");
    }

    /** With a step id, takes off only that step row; without, the task and any step rows under it. */
    static void remove(Context c, String id, String sid) {
        try {
            JSONArray a = read(c), out = new JSONArray();
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                boolean hit = id.equals(o.optString("id"))
                        && (sid.length() == 0 || sid.equals(o.optString("s")));
                if (!hit) out.put(o);
            }
            c.getSharedPreferences("nexus", 0).edit().putString("snap", out.toString()).apply();
        } catch (Exception ignored) {
        }
    }
}
