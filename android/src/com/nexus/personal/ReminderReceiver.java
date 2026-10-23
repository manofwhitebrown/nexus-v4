package com.nexus.personal;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

/** Shows a reminder as a notification, with a Done button. */
public class ReminderReceiver extends BroadcastReceiver {
    static final String CHANNEL = "nexus_reminders";

    @Override
    public void onReceive(Context c, Intent i) {
        String id = i.getStringExtra("id"), title = i.getStringExtra("title"), body = i.getStringExtra("body");
        if (id == null) return;
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, Loc.wrap(c).getString(R.string.reminders_channel),
                    NotificationManager.IMPORTANCE_DEFAULT));
        }
        int nid = id.hashCode();
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent open = PendingIntent.getActivity(c, nid, new Intent(c, MainActivity.class), flags);
        Intent done = new Intent(c, DoneReceiver.class).setAction(DoneReceiver.ACTION)
                .setData(Uri.parse("nexus://done/" + id)).putExtra("id", id).putExtra("nid", nid);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_tile)
                .setContentTitle(title == null || title.length() == 0 ? "Nexus" : title)
                .setContentText(body == null ? "" : body)
                .setContentIntent(open)
                .setAutoCancel(true)
                .addAction(0, Loc.wrap(c).getString(R.string.done), PendingIntent.getBroadcast(c, nid, done, flags));
        nm.notify(nid, b.build());
    }
}
