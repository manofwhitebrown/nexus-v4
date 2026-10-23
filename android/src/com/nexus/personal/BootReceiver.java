package com.nexus.personal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After a restart or an update: puts task reminders back, and the floating bubble if it was switched on. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(i.getAction())) Reminders.reschedule(c);
        if (Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())
                && c.getSharedPreferences("nexus", 0).getBoolean("bubble_on", false)
                && BubbleService.canDraw(c)) {
            BubbleService.start(c); // start() already ignores a refused background start
        }
    }
}
