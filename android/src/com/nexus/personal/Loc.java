package com.nexus.personal;

import android.content.Context;
import android.content.res.Configuration;
import java.util.Locale;

/**
 * Makes the native screens (bubble, quick add, reminders, widget) follow the language picked
 * inside Nexus instead of only the phone's language. "auto" or anything unknown keeps the phone's.
 */
final class Loc {
    private Loc() {}

    static final String PREF = "lang";

    static String get(Context c) {
        String v = c.getSharedPreferences("nexus", 0).getString(PREF, "auto");
        return ("en".equals(v) || "hi".equals(v) || "te".equals(v)) ? v : "auto";
    }

    static void set(Context c, String v) {
        if (!("auto".equals(v) || "en".equals(v) || "hi".equals(v) || "te".equals(v))) return;
        c.getSharedPreferences("nexus", 0).edit().putString(PREF, v).apply();
    }

    /** A context whose resources use the chosen language. Safe to call with any context. */
    static Context wrap(Context c) {
        String v = get(c);
        if ("auto".equals(v)) return c;
        try {
            Configuration cfg = new Configuration(c.getResources().getConfiguration());
            cfg.setLocale(new Locale(v));
            return c.createConfigurationContext(cfg);
        } catch (Exception e) {
            return c;
        }
    }
}
