package com.nexus.personal;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/** Home-screen widget: the next few tasks, a tick for each, and a button that opens quick add. */
public class NexusWidget extends AppWidgetProvider {
    private static final int[] ROW = {R.id.r1, R.id.r2, R.id.r3, R.id.r4};
    private static final int[] CHECK = {R.id.c1, R.id.c2, R.id.c3, R.id.c4};
    private static final int[] TEXT = {R.id.t1, R.id.t2, R.id.t3, R.id.t4};
    private static final int FLAGS = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, NexusWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews v = build(c);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        Context lc = Loc.wrap(c);
        v.setTextViewText(R.id.title, lc.getString(R.string.widget_title));
        v.setTextViewText(R.id.add, lc.getString(R.string.widget_add));
        v.setTextViewText(R.id.empty, lc.getString(R.string.widget_empty));
        v.setOnClickPendingIntent(R.id.add, PendingIntent.getActivity(c, 1,
                new Intent(c, QuickAddActivity.class), FLAGS));
        v.setOnClickPendingIntent(R.id.title, PendingIntent.getActivity(c, 2,
                new Intent(c, MainActivity.class), FLAGS));
        JSONArray a = Snap.read(c);
        int n = Math.min(a.length(), ROW.length);
        v.setViewVisibility(R.id.empty, n == 0 ? View.VISIBLE : View.GONE);
        for (int i = 0; i < ROW.length; i++) {
            if (i >= n) {
                v.setViewVisibility(ROW[i], View.GONE);
                continue;
            }
            try {
                JSONObject o = a.getJSONObject(i);
                String id = o.optString("id"), d = o.optString("d");
                String t = o.optString("t") + (d.length() > 0 ? "  " + d : "");
                v.setViewVisibility(ROW[i], View.VISIBLE);
                v.setTextViewText(TEXT[i], t);
                Intent done = new Intent(c, DoneReceiver.class).setAction(DoneReceiver.ACTION)
                        .setData(Uri.parse("nexus://done/" + id)).putExtra("id", id);
                v.setOnClickPendingIntent(CHECK[i], PendingIntent.getBroadcast(c, 0, done, FLAGS));
                v.setOnClickPendingIntent(TEXT[i], PendingIntent.getActivity(c, 2,
                        new Intent(c, MainActivity.class), FLAGS));
            } catch (Exception e) {
                v.setViewVisibility(ROW[i], View.GONE);
            }
        }
        return v;
    }
}
