package com.nexus.personal;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** A tick on the widget or on a reminder. The web app applies it next time it opens. */
public class DoneReceiver extends BroadcastReceiver {
    static final String ACTION = "com.nexus.personal.DONE";

    @Override
    public void onReceive(Context c, Intent i) {
        String id = i.getStringExtra("id");
        if (id == null || id.length() == 0) return;
        Inbox.addDone(c, id);
        Snap.remove(c, id);
        Reminders.cancel(c, id);
        int nid = i.getIntExtra("nid", 0);
        if (nid != 0) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(nid);
        }
        NexusWidget.refresh(c);
    }
}
