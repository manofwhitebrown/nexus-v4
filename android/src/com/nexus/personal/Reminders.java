package com.nexus.personal;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reminders that fire when Nexus is closed. The web app hands over a list of {id, at, title, body}
 * whenever its tasks change; each becomes an Android alarm. Alarms are "inexact" on purpose: they need
 * no special permission, and Android may deliver one a few minutes late to save battery.
 */
final class Reminders {
    private static final int FLAGS = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;

    private Reminders() {}

    static PendingIntent pending(Context c, String id, String title, String body) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction("com.nexus.personal.REMIND")
                .setData(Uri.parse("nexus://remind/" + id))
                .putExtra("id", id).putExtra("title", title).putExtra("body", body);
        return PendingIntent.getBroadcast(c, 0, i, FLAGS);
    }

    private static JSONArray stored(Context c) {
        try {
            return new JSONArray(c.getSharedPreferences("nexus", 0).getString("rem", "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static synchronized void set(Context c, String json) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        cancelAll(c, am);
        JSONArray keep = new JSONArray();
        try {
            JSONArray a = new JSONArray(json);
            long now = System.currentTimeMillis();
            for (int i = 0; i < a.length() && keep.length() < 50; i++) {
                JSONObject o = a.getJSONObject(i);
                long at = o.optLong("at");
                String id = o.optString("id");
                if (id.length() == 0 || at <= now) continue;
                keep.put(o);
                schedule(c, am, o);
            }
        } catch (Exception ignored) {
        }
        c.getSharedPreferences("nexus", 0).edit().putString("rem", keep.toString()).apply();
    }

    private static void schedule(Context c, AlarmManager am, JSONObject o) {
        PendingIntent pi = pending(c, o.optString("id"), o.optString("title"), o.optString("body"));
        long at = o.optLong("at");
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.set(AlarmManager.RTC_WAKEUP, at, pi);
    }

    private static void cancelAll(Context c, AlarmManager am) {
        JSONArray a = stored(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null) am.cancel(pending(c, o.optString("id"), o.optString("title"), o.optString("body")));
        }
    }

    /** A task was ticked off elsewhere: drop its alarm. */
    static synchronized void cancel(Context c, String id) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        JSONArray a = stored(c), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null) continue;
            if (id.equals(o.optString("id"))) am.cancel(pending(c, id, o.optString("title"), o.optString("body")));
            else out.put(o);
        }
        c.getSharedPreferences("nexus", 0).edit().putString("rem", out.toString()).apply();
    }

    /** Alarms are forgotten on restart, so put them back. */
    static synchronized void reschedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        JSONArray a = stored(c);
        long now = System.currentTimeMillis();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && o.optLong("at") > now) schedule(c, am, o);
        }
    }
}
