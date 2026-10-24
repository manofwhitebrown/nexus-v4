package com.nexus.personal;

import android.Manifest;
import android.animation.ValueAnimator;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.provider.Settings;
import android.text.InputType;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;

/**
 * A floating Nexus bubble that stays over other apps, like a screen recorder's controls.
 * Tap it to open a small panel for a note, a voice recording or a screenshot. Drag it anywhere.
 * Drag it to the bottom target to hide it. Everything goes to the Inbox and appears in Nexus the
 * next time the app is opened.
 *
 * Resting state: the bubble tucks into the left or right edge of the screen and only a small tab
 * shows, so it is never in the way. Tap the tab to slide it out, tap it again to open the panel.
 * It tucks itself back in after a couple of seconds.
 *
 * Colours come from the Nexus theme and accent (sent over by native.js) and the text comes from
 * the language picked in Nexus. Both are read fresh, so changing them in Nexus shows up at once.
 */
public class BubbleService extends Service {

    @Override
    protected void attachBaseContext(android.content.Context base) {
        super.attachBaseContext(Loc.wrap(base));
    }
    static final String CHANNEL = "nexus_bubble";
    static final String ACTION_STOP = "com.nexus.personal.STOP";
    static final String ACTION_PROJECTION = "com.nexus.personal.PROJECTION";
    static volatile boolean running = false;
    /** The live service, so the app can tell it that the theme or language changed. */
    private static volatile BubbleService instance;
    /** How much of the bubble stays on screen while it is tucked into an edge. */
    private static final float PEEK_DP = 26f;
    private static final int TUCK_DELAY = 2500;
    /** Set while a screenshot is waiting for the user to allow screen capture. */
    static volatile boolean shotPending = false;

    private WindowManager wm;
    private LogoBubble bubble;
    private TextView closeTarget;
    private Panel panel;
    private EditText input;
    private WindowManager.LayoutParams bubbleLp;
    private int screenW, screenH;
    private float density;
    private String kind = "auto";
    private final Handler handler = new Handler();

    // theme + docking
    private Pal pal;
    private int side = 1;                 // 1 = right edge, -1 = left edge
    private boolean docked = false;       // true while tucked into the edge
    private boolean touching = false;
    private ValueAnimator slide;
    private final Runnable dockRun = new Runnable() {
        @Override
        public void run() {
            dock();
        }
    };

    // voice recording
    private MediaRecorder rec;
    private File recFile;
    private long recStart;
    private boolean recording = false;
    private TextView recBtn;
    private TextView statusView;

    // screen capture
    private MediaProjection projection;
    private VirtualDisplay vd;
    private ImageReader reader;
    private Image held;
    private int dpiNow = 320;

    /** Text in the language picked inside Nexus, looked up each time rather than cached at start. */
    private String s(int id) {
        return Loc.wrap(getApplicationContext()).getString(id);
    }

    private String s(int id, Object... args) {
        return Loc.wrap(getApplicationContext()).getString(id, args);
    }

    /** Called by the app when the theme, accent or language changes. Safe from any thread. */
    static void refresh() {
        final BubbleService svc = instance;
        if (svc == null) return;
        svc.handler.post(new Runnable() {
            @Override
            public void run() {
                svc.onLookChanged();
            }
        });
    }

    private void onLookChanged() {
        if (bubble == null) return;
        pal = Pal.load(this);
        if (panel != null) closePanel();   // it is rebuilt with the new colours and words next time
        bubble.setPal(pal);
        try {
            refreshForeground(false);      // the notification text is in the chosen language too
        } catch (Exception ignored) {
        }
    }

    static boolean canDraw(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
    }

    static void start(Context c) {
        Intent i = new Intent(c, BubbleService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception ignored) {
            // Android can refuse a background start. The bubble then starts next time Nexus is opened.
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            getSharedPreferences("nexus", 0).edit().putBoolean("bubble_on", false).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        boolean proj = intent != null && ACTION_PROJECTION.equals(intent.getAction());
        try {
            // Android wants the foreground type declared before screen capture begins.
            refreshForeground(proj);
        } catch (Exception e) {
            if (!proj) {
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        if (!canDraw(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (bubble == null) {
            density = getResources().getDisplayMetrics().density;
            wm = (WindowManager) getSystemService(WINDOW_SERVICE);
            measureScreen();
            pal = Pal.load(this);
            addBubble();
            running = true;
            instance = this;
        }
        if (proj) {
            startProjection(intent.getIntExtra("code", 0), (Intent) intent.getParcelableExtra("data"));
        }
        return START_STICKY;
    }

    /** Keep the bubble on screen when the phone is rotated. */
    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        if (wm == null || bubble == null) return;
        measureScreen();
        if (slide != null) slide.cancel();
        bubbleLp.x = restX(docked);        // stay tucked into the same edge after a rotation
        clamp();
        try {
            wm.updateViewLayout(bubble, bubbleLp);
        } catch (Exception ignored) {
        }
        resizeCapture();
    }

    @Override
    public void onDestroy() {
        running = false;
        instance = null;
        handler.removeCallbacks(dockRun);
        if (slide != null) slide.cancel();
        if (recording) stopRecording(true);
        endProjection();
        try {
            if (panel != null) wm.removeView(panel);
        } catch (Exception ignored) {
        }
        try {
            if (bubble != null) wm.removeView(bubble);
        } catch (Exception ignored) {
        }
        hideCloseTarget();
        bubble = null;
        panel = null;
        super.onDestroy();
    }

    private int dp(float v) {
        return Math.round(v * density);
    }

    @SuppressWarnings("deprecation")
    private void measureScreen() {
        DisplayMetrics m = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(m);
        screenW = m.widthPixels;
        screenH = m.heightPixels;
    }

    private int overlayType() {
        return Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
    }

    /**
     * Shows the notification and tells Android what the service is doing right now, because
     * recording and screen capture each need their own foreground type.
     */
    private void refreshForeground(boolean wantProjection) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, s(R.string.bubble_channel),
                    NotificationManager.IMPORTANCE_MIN);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        int imm = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent open = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class), imm);
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, BubbleService.class).setAction(ACTION_STOP), imm);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        String text = recording ? s(R.string.bubble_recording)
                : (projection != null ? s(R.string.bubble_shots_ready) : s(R.string.bubble_tap));
        b.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(s(R.string.bubble_title))
                .setContentText(text)
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(0, s(R.string.bubble_hide), stop);
        int type = 0;
        if (Build.VERSION.SDK_INT >= 34) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
        if (recording && Build.VERSION.SDK_INT >= 30) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        if ((projection != null || wantProjection) && Build.VERSION.SDK_INT >= 29) {
            type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
        }
        if (type != 0 && Build.VERSION.SDK_INT >= 29) startForeground(1, b.build(), type);
        else startForeground(1, b.build());
    }

    private void toast(String t) {
        Toast.makeText(this, t, Toast.LENGTH_SHORT).show();
    }

    /** Opens the see-through screen that asks Android for a permission. */
    private void openAction(String what) {
        try {
            Intent i = new Intent(this, ActionActivity.class).putExtra("what", what);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            toast(s(R.string.open_nexus_once));
        }
    }

    // ---------- bubble ----------

    private GradientDrawable circle(int fill) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(fill);
        g.setStroke(dp(1), 0x33000000);
        return g;
    }

    /** Colours taken from the Nexus theme and accent, with the graphite dark look as the fallback. */
    private static final class Pal {
        int bg = 0xFF0D0D0E, surface = 0xFF161617, ink = 0xFFECECEA, mu = 0xFF9A9A9F;
        int accent = 0xFFECECEA, onAccent = 0xFF0D0D0E, primary = 0xFFF6F6F4, danger = 0xFFE8847C;
        int line, chip, ring;

        static int mix(int a, int b, float t) {
            int r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
            int g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
            int bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
            return 0xFF000000 | (r << 16) | (g << 8) | bl;
        }

        private static int col(JSONObject o, String k, int dflt) {
            try {
                String v = o.optString(k, "");
                return v.length() == 0 ? dflt : (0xFF000000 | android.graphics.Color.parseColor(v));
            } catch (Exception e) {
                return dflt;
            }
        }

        static Pal load(Context c) {
            Pal p = new Pal();
            android.content.SharedPreferences ui = c.getSharedPreferences("nexus_ui", 0);
            boolean light = ui.getBoolean("light", false);
            if (light) {
                p.bg = 0xFFE9E8E4;
                p.surface = 0xFFF3F2EF;
                p.ink = 0xFF141415;
                p.mu = 0xFF5C5C61;
                p.accent = 0xFF141415;
                p.onAccent = 0xFFF3F2EF;
                p.primary = 0xFF2E2E32;
                p.danger = 0xFFB3261E;
            }
            String j = ui.getString("palette", null);
            if (j != null) {
                try {
                    JSONObject o = new JSONObject(j);
                    // Ignore a palette saved for the other theme; the next change replaces it.
                    if (o.optBoolean("light", light) == light) {
                        p.bg = col(o, "bg", p.bg);
                        p.surface = col(o, "s", p.surface);
                        p.ink = col(o, "ink", p.ink);
                        p.mu = col(o, "mu", p.mu);
                        p.accent = col(o, "ac", p.accent);
                        p.onAccent = col(o, "on", p.onAccent);
                        p.primary = col(o, "pa", p.primary);
                        p.danger = col(o, "dg", p.danger);
                    }
                } catch (Exception ignored) {
                }
            }
            p.line = mix(p.surface, p.ink, 0.14f);
            p.chip = mix(p.surface, p.ink, 0.12f);
            p.ring = mix(p.surface, p.accent, 0.38f);
            return p;
        }
    }

    /**
     * The Nexus mark on a disc in the app's colours: the left half is solid and the right half is only
     * an outline, like something half hidden. A red dot shows while a voice note is being recorded.
     * When the bubble is tucked into a screen edge the mark slides toward the part that is still visible.
     */
    private class LogoBubble extends View {
        private final Paint disc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path logo = new Path();
        private boolean red = false;
        private int dockSide = 0;       // 1 = tucked into the right edge, -1 = left
        private float dockAmt = 0f;     // 0 = fully out, 1 = fully tucked in

        LogoBubble(Context c, Pal p) {
            super(c);
            ring.setStyle(Paint.Style.STROKE);
            fill.setStyle(Paint.Style.FILL);
            line.setStyle(Paint.Style.STROKE);
            line.setStrokeJoin(Paint.Join.MITER);
            setPal(p);
            float[] q = {0, 0, 22, 0, 44.5f, 58, 59, 0, 83, 0, 83, 94, 59, 94, 23, 36, 34, 94, 0, 94};
            logo.moveTo(q[0], q[1]);
            for (int i = 2; i < q.length; i += 2) logo.lineTo(q[i], q[i + 1]);
            logo.close();
        }

        void setPal(Pal p) {
            disc.setColor(p.surface);
            ring.setColor(p.ring);
            fill.setColor(p.accent);
            line.setColor(p.accent);
            dot.setColor(p.danger);
            invalidate();
        }

        void setRecording(boolean on) {
            red = on;
            invalidate();
        }

        float amt() {
            return dockAmt;
        }

        void setDock(int sideNow, float amt) {
            dockSide = sideNow;
            dockAmt = amt;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            float w = getWidth(), h = getHeight(), r = Math.min(w, h) / 2f;
            c.drawCircle(w / 2f, h / 2f, r, disc);
            ring.setStrokeWidth(dp(1));
            c.drawCircle(w / 2f, h / 2f, r - dp(0.5f), ring);
            float lh = h * 0.46f, sc = lh / 94f, lw = 83f * sc;
            // Centre the mark in the part that is still on screen while the bubble is tucked in.
            float shift = -dockSide * dockAmt * (w - dp(PEEK_DP)) / 2f;
            c.save();
            c.translate((w - lw) / 2f + shift, (h - lh) / 2f);
            c.scale(sc, sc);
            c.save();
            c.clipRect(-10f, -10f, 41.5f, 104f);
            c.drawPath(logo, fill);
            c.restore();
            line.setStrokeWidth(dp(1.6f) / sc);
            c.save();
            c.clipRect(41.5f, -10f, 93f, 104f);
            c.drawPath(logo, line);
            c.restore();
            c.restore();
            if (red) {
                boolean visibleOnLeft = dockSide > 0 && dockAmt > 0.5f;
                c.drawCircle(visibleOnLeft ? dp(11) : w - dp(11), dp(11), dp(5), dot);
            }
        }
    }

    private void addBubble() {
        bubble = new LogoBubble(this, pal);
        bubble.setContentDescription(s(R.string.bubble_desc));

        int size = dp(54);
        bubbleLp = new WindowManager.LayoutParams(size, size, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        bubbleLp.gravity = Gravity.TOP | Gravity.LEFT;
        android.content.SharedPreferences p = getSharedPreferences("nexus", 0);
        // Older versions saved an x position instead of a side.
        side = p.contains("bubble_side") ? (p.getInt("bubble_side", 1) < 0 ? -1 : 1)
                : (p.getInt("bubble_x", screenW) + size / 2 < screenW / 2 ? -1 : 1);
        bubbleLp.y = p.getInt("bubble_y", screenH / 3);
        // Start tucked into the edge so it is not sitting in front of whatever is on screen.
        docked = true;
        bubbleLp.x = restX(true);
        clamp();
        bubble.setDock(side, 1f);
        bubble.setAlpha(DOCK_ALPHA);

        bubble.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            int startX, startY;
            boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        touching = true;
                        handler.removeCallbacks(dockRun);
                        if (slide != null) slide.cancel();
                        startX = bubbleLp.x;
                        startY = bubbleLp.y;
                        downX = e.getRawX();
                        downY = e.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float mx = e.getRawX() - downX;
                        float my = e.getRawY() - downY;
                        if (!moved && Math.hypot(mx, my) > dp(8)) {
                            moved = true;
                            if (docked) {
                                // Pull it out from under the finger, then drag it from there.
                                docked = false;
                                bubble.setDock(side, 0f);
                                bubble.setAlpha(OUT_ALPHA);
                                startX = Math.round(e.getRawX() - bubbleLp.width / 2f);
                                startY = bubbleLp.y;
                                downX = e.getRawX();
                                downY = e.getRawY();
                                mx = 0;
                                my = 0;
                            }
                            showCloseTarget();
                        }
                        if (moved) {
                            bubbleLp.x = (int) (startX + mx);
                            bubbleLp.y = (int) (startY + my);
                            clamp();
                            wm.updateViewLayout(bubble, bubbleLp);
                            highlightClose(nearClose());
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        touching = false;
                        boolean cancelled = e.getActionMasked() == MotionEvent.ACTION_CANCEL;
                        if (!moved) {
                            if (cancelled) {
                                scheduleDock(TUCK_DELAY);
                            } else if (docked) {
                                undock();               // first tap: bring it back onto the screen
                            } else {
                                openPanel();            // second tap: open the note panel
                            }
                        } else {
                            boolean hide = nearClose();
                            hideCloseTarget();
                            if (hide) {
                                getSharedPreferences("nexus", 0).edit()
                                        .putBoolean("bubble_on", false).apply();
                                stopSelf();
                            } else {
                                settleOnEdge();
                            }
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });
        wm.addView(bubble, bubbleLp);
    }

    private static final float DOCK_ALPHA = 0.72f;
    private static final float OUT_ALPHA = 0.96f;

    /** Where the bubble's left edge sits: tucked into the screen edge, or fully out beside it. */
    private int restX(boolean tucked) {
        int size = bubbleLp.width, margin = dp(6), peek = dp(PEEK_DP);
        if (side > 0) return tucked ? screenW - peek : screenW - size - margin;
        return tucked ? -(size - peek) : margin;
    }

    private void clamp() {
        int size = bubbleLp.width, peek = dp(PEEK_DP);
        int lo = docked ? -(size - peek) : 0;
        int hi = docked ? screenW - peek : screenW - size;
        bubbleLp.x = Math.max(lo, Math.min(hi, bubbleLp.x));
        bubbleLp.y = Math.max(dp(24), Math.min(screenH - size - dp(24), bubbleLp.y));
    }

    /** Slides to x and fades between the tucked and the fully visible look. */
    private void slideTo(final int toX, final float toAmt) {
        if (bubble == null) return;
        if (slide != null) slide.cancel();
        final int fromX = bubbleLp.x;
        final float fromAmt = bubble.amt();
        slide = ValueAnimator.ofFloat(0f, 1f);
        slide.setDuration(180);
        slide.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator va) {
                if (bubble == null) return;
                float t = va.getAnimatedFraction();
                float amt = fromAmt + (toAmt - fromAmt) * t;
                bubbleLp.x = Math.round(fromX + (toX - fromX) * t);
                bubble.setDock(side, amt);
                bubble.setAlpha(OUT_ALPHA + (DOCK_ALPHA - OUT_ALPHA) * amt);
                try {
                    wm.updateViewLayout(bubble, bubbleLp);
                } catch (Exception ignored) {
                }
            }
        });
        slide.start();
    }

    private void scheduleDock(int ms) {
        handler.removeCallbacks(dockRun);
        handler.postDelayed(dockRun, ms);
    }

    /** Tuck the bubble into its edge so only the small tab shows. */
    private void dock() {
        if (bubble == null || panel != null || touching || docked) return;
        docked = true;
        slideTo(restX(true), 1f);
        saveSpot();
    }

    /** Bring it fully out. It tucks itself back in after a moment unless it is used. */
    private void undock() {
        if (bubble == null || !docked) return;
        docked = false;
        slideTo(restX(false), 0f);
        scheduleDock(TUCK_DELAY + 1500);
    }

    /** After a drag: pick the nearer edge, slide to it, then tuck in shortly after. */
    private void settleOnEdge() {
        side = (bubbleLp.x + bubbleLp.width / 2 < screenW / 2) ? -1 : 1;
        docked = false;
        slideTo(restX(false), 0f);
        saveSpot();
        scheduleDock(1200);
    }

    private void saveSpot() {
        getSharedPreferences("nexus", 0).edit()
                .putInt("bubble_side", side).putInt("bubble_y", bubbleLp.y).apply();
    }

    // ---------- hide target ----------

    private WindowManager.LayoutParams closeLp() {
        int s = dp(56);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(s, s, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(56);
        return lp;
    }

    private void showCloseTarget() {
        if (closeTarget != null) return;
        closeTarget = new TextView(this);
        closeTarget.setText("\u00D7");
        closeTarget.setTextColor(pal.ink);
        closeTarget.setTextSize(26);
        closeTarget.setGravity(Gravity.CENTER);
        closeTarget.setBackground(circle(pal.chip));
        wm.addView(closeTarget, closeLp());
    }

    private void hideCloseTarget() {
        if (closeTarget == null) return;
        try {
            wm.removeView(closeTarget);
        } catch (Exception ignored) {
        }
        closeTarget = null;
    }

    private boolean nearClose() {
        float bx = bubbleLp.x + bubbleLp.width / 2f;
        float by = bubbleLp.y + bubbleLp.height / 2f;
        float cx = screenW / 2f;
        float cy = screenH - dp(56) - dp(28);
        return Math.hypot(bx - cx, by - cy) < dp(80);
    }

    private void highlightClose(boolean near) {
        if (closeTarget != null) closeTarget.setBackground(circle(near ? pal.danger : pal.chip));
    }

    // ---------- note panel ----------

    /** Closes itself when the Back button is pressed. */
    private class Panel extends LinearLayout {
        Panel(Context c) {
            super(c);
        }

        @Override
        public boolean dispatchKeyEvent(KeyEvent e) {
            if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) {
                if (e.getAction() == KeyEvent.ACTION_UP) closePanel();
                return true;
            }
            return super.dispatchKeyEvent(e);
        }
    }

    private TextView button(String label, int fill, int ink) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextColor(ink);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextSize(15);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(16), dp(11), dp(16), dp(11));
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(6));
        t.setBackground(g);
        return t;
    }

    private void styleChip(TextView t, boolean on) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(on ? pal.accent : pal.chip);
        g.setCornerRadius(dp(6));
        t.setBackground(g);
        t.setTextColor(on ? pal.onAccent : pal.ink);
    }

    private void openPanel() {
        if (panel != null) return;
        handler.removeCallbacks(dockRun);
        pal = Pal.load(this);
        bubble.setPal(pal);
        bubble.setVisibility(View.INVISIBLE);

        panel = new Panel(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(14), dp(16), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(pal.surface);
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(1), pal.line);
        panel.setBackground(bg);

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText(s(R.string.quick_note));
        title.setTextColor(pal.ink);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextSize(17);
        head.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView x = new TextView(this);
        x.setText(s(R.string.close));
        x.setTextColor(pal.mu);
        x.setTextSize(14);
        x.setPadding(dp(10), dp(6), dp(2), dp(6));
        x.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                closePanel();
            }
        });
        head.addView(x);
        panel.addView(head);

        input = new EditText(this);
        input.setHint(s(R.string.type_note));
        input.setHintTextColor(pal.mu);
        input.setTextColor(pal.ink);
        input.setTextSize(16);
        input.setMinLines(3);
        input.setMaxLines(6);
        input.setGravity(Gravity.TOP | Gravity.START);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setPadding(dp(12), dp(10), dp(12), dp(10));
        GradientDrawable ib = new GradientDrawable();
        ib.setColor(pal.bg);
        ib.setCornerRadius(dp(6));
        ib.setStroke(dp(1), pal.line);
        input.setBackground(ib);
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        ilp.topMargin = dp(10);
        panel.addView(input, ilp);

        LinearLayout chips = new LinearLayout(this);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        final String[] kinds = {"auto", "note", "task", "idea"};
        final String[] names = {s(R.string.kind_auto), s(R.string.kind_note), s(R.string.kind_task), s(R.string.kind_idea)};
        final TextView[] cs = new TextView[kinds.length];
        for (int i = 0; i < kinds.length; i++) {
            final int idx = i;
            cs[i] = new TextView(this);
            cs[i].setText(names[i]);
            cs[i].setTextSize(14);
            cs[i].setPadding(dp(12), dp(8), dp(12), dp(8));
            styleChip(cs[i], kinds[i].equals(kind));
            cs[i].setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    kind = kinds[idx];
                    for (int j = 0; j < cs.length; j++) styleChip(cs[j], j == idx);
                }
            });
            LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            clp.rightMargin = dp(8);
            chips.addView(cs[i], clp);
        }
        LinearLayout.LayoutParams chlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        chlp.topMargin = dp(10);
        panel.addView(chips, chlp);

        LinearLayout media = new LinearLayout(this);
        media.setOrientation(LinearLayout.HORIZONTAL);
        recBtn = button(s(R.string.record_voice), pal.chip, pal.ink);
        recBtn.setTextSize(14);
        TextView shot = button(s(R.string.screenshot), pal.chip, pal.ink);
        shot.setTextSize(14);
        recBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (recording) stopRecording(false);
                else startRecording();
            }
        });
        shot.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                takeShot();
            }
        });
        LinearLayout.LayoutParams m1 = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        m1.rightMargin = dp(8);
        media.addView(recBtn, m1);
        media.addView(shot, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        mlp.topMargin = dp(10);
        panel.addView(media, mlp);
        updateRecUi();

        final TextView status = new TextView(this);
        statusView = status;
        status.setTextColor(pal.mu);
        status.setTextSize(13);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        slp.topMargin = dp(8);
        panel.addView(status, slp);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        TextView save = button(s(R.string.save), pal.primary, pal.onAccent);
        TextView open = button(s(R.string.open_nexus), pal.chip, pal.ink);
        save.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String text = input.getText().toString().trim();
                if (text.length() == 0) {
                    status.setText(s(R.string.type_first));
                    return;
                }
                if (text.length() > 5000) text = text.substring(0, 5000);
                Inbox.add(BubbleService.this, text, kind);
                input.setText("");
                status.setText(s(R.string.saved_inbox));
            }
        });
        open.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                closePanel();
                Intent i = new Intent(BubbleService.this, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(i);
            }
        });
        LinearLayout.LayoutParams b1 = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        b1.rightMargin = dp(8);
        row.addView(save, b1);
        row.addView(open, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rlp.topMargin = dp(10);
        panel.addView(row, rlp);

        panel.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent e) {
                if (e.getAction() == MotionEvent.ACTION_OUTSIDE) {
                    closePanel();
                    return true;
                }
                return false;
            }
        });

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                Math.min(screenW - dp(32), dp(380)),
                WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(72);
        lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
                | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN;
        wm.addView(panel, lp);

        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (input == null) return;
                input.requestFocus();
                InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
            }
        }, 150);
    }

    private void closePanel() {
        if (panel == null) return;
        try {
            InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (imm != null && input != null) imm.hideSoftInputFromWindow(input.getWindowToken(), 0);
            wm.removeView(panel);
        } catch (Exception ignored) {
        }
        panel = null;
        input = null;
        recBtn = null;
        statusView = null;
        if (bubble != null) {
            bubble.setVisibility(View.VISIBLE);
            scheduleDock(TUCK_DELAY);
        }
    }

    private void say(String t) {
        if (statusView != null) statusView.setText(t);
        else toast(t);
    }

    // ---------- voice recording ----------

    private String stamp() {
        return new java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.US).format(new java.util.Date());
    }

    private void updateRecUi() {
        if (bubble != null) bubble.setRecording(recording);
        if (recBtn == null) return;
        if (recording) {
            long sec = (android.os.SystemClock.elapsedRealtime() - recStart) / 1000;
            recBtn.setText(s(R.string.stop_fmt, (sec / 60 < 10 ? "0" : "") + (sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60)));
            recBtn.setTextColor(pal.danger);
        } else {
            recBtn.setText(s(R.string.record_voice));
            recBtn.setTextColor(pal.ink);
        }
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!recording) return;
            updateRecUi();
            handler.postDelayed(this, 500);
        }
    };

    private void startRecording() {
        if (recording) return;
        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            say(s(R.string.allow_mic));
            openAction("mic");
            return;
        }
        try {
            recording = true;
            refreshForeground(false);          // the microphone type must be active before recording starts
            recFile = new File(Inbox.mediaDir(this), "voice-" + stamp() + ".m4a");
            MediaRecorder r = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
            r.setAudioSource(MediaRecorder.AudioSource.MIC);
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            r.setAudioEncodingBitRate(96000);
            r.setAudioSamplingRate(44100);
            r.setOutputFile(recFile.getAbsolutePath());
            r.prepare();
            r.start();
            rec = r;
            recStart = android.os.SystemClock.elapsedRealtime();
            handler.post(tick);
            updateRecUi();
            say(s(R.string.recording_on));
        } catch (Exception e) {
            recording = false;
            try {
                if (rec != null) rec.release();
            } catch (Exception ignored) {
            }
            rec = null;
            if (recFile != null) recFile.delete();
            try {
                refreshForeground(false);
            } catch (Exception ignored) {
            }
            updateRecUi();
            say(s(R.string.record_blocked));
        }
    }

    private void stopRecording(boolean quiet) {
        if (!recording) return;
        recording = false;
        boolean good = true;
        try {
            rec.stop();
        } catch (Exception e) {
            good = false;                       // stopped too quickly to hold any sound
        }
        try {
            rec.release();
        } catch (Exception ignored) {
        }
        rec = null;
        handler.removeCallbacks(tick);
        if (good && recFile != null && recFile.length() > 0) {
            Inbox.addMedia(this, "voice", recFile.getName(), s(R.string.voice_note_title));
            if (!quiet) say(s(R.string.saved_inbox));
        } else {
            if (recFile != null) recFile.delete();
            if (!quiet) say(s(R.string.too_short));
        }
        recFile = null;
        try {
            if (!quiet) refreshForeground(false);
        } catch (Exception ignored) {
        }
        updateRecUi();
    }

    // ---------- screenshots ----------

    private void takeShot() {
        if (projection == null || reader == null) {
            shotPending = true;
            say(s(R.string.allow_capture));
            openAction("projection");
            return;
        }
        closePanel();
        if (bubble != null) bubble.setVisibility(View.INVISIBLE);   // keep the bubble out of the picture
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                saveFrame();
                if (bubble != null) {
                    bubble.setVisibility(View.VISIBLE);
                    scheduleDock(TUCK_DELAY);
                }
            }
        }, 450);
    }

    private void startProjection(int code, Intent data) {
        try {
            if (projection != null) endProjection();
            MediaProjectionManager m = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
            projection = m.getMediaProjection(code, data);
            if (projection == null) throw new IllegalStateException("no projection");
            projection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            endProjection();
                        }
                    });
                }
            }, handler);
            buildDisplay();
            refreshForeground(false);
            if (shotPending) {
                shotPending = false;
                handler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        takeShot();
                    }
                }, 500);
            }
        } catch (Exception e) {
            endProjection();
            toast(s(R.string.capture_failed));
        }
    }

    @SuppressWarnings("deprecation")
    private void buildDisplay() {
        DisplayMetrics m = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(m);
        dpiNow = m.densityDpi;
        reader = newReader(m.widthPixels, m.heightPixels);
        vd = projection.createVirtualDisplay("nexus-capture", m.widthPixels, m.heightPixels, dpiNow,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, handler);
    }

    private ImageReader newReader(int w, int h) {
        ImageReader r = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 3);
        r.setOnImageAvailableListener(new ImageReader.OnImageAvailableListener() {
            @Override
            public void onImageAvailable(ImageReader rd) {
                Image im = null;
                try {
                    im = rd.acquireLatestImage();
                } catch (Exception ignored) {
                }
                if (im == null) return;
                if (held != null) held.close();
                held = im;                      // always keep the newest frame
            }
        }, handler);
        return r;
    }

    /** After a rotation the capture surface must match the new screen size. */
    private void resizeCapture() {
        if (vd == null || projection == null) return;
        try {
            ImageReader old = reader;
            reader = newReader(screenW, screenH);
            vd.resize(screenW, screenH, dpiNow);
            vd.setSurface(reader.getSurface());
            if (held != null) held.close();
            held = null;
            if (old != null) old.close();
        } catch (Exception e) {
            endProjection();
        }
    }

    private void saveFrame() {
        Image im = held;
        if (im == null) {
            toast(s(R.string.no_picture));
            return;
        }
        try {
            Image.Plane pl = im.getPlanes()[0];
            ByteBuffer buf = pl.getBuffer();
            int px = pl.getPixelStride(), rs = pl.getRowStride(), w = im.getWidth(), h = im.getHeight();
            Bitmap full = Bitmap.createBitmap(w + (rs - px * w) / px, h, Bitmap.Config.ARGB_8888);
            buf.rewind();
            full.copyPixelsFromBuffer(buf);
            final Bitmap shot = Bitmap.createBitmap(full, 0, 0, w, h);
            if (full != shot) full.recycle();
            final File out = new File(Inbox.mediaDir(this), "shot-" + stamp() + ".jpg");
            new Thread(new Runnable() {
                @Override
                public void run() {
                    boolean ok = false;
                    try {
                        FileOutputStream fo = new FileOutputStream(out);
                        ok = shot.compress(Bitmap.CompressFormat.JPEG, 88, fo);
                        fo.close();
                    } catch (Exception ignored) {
                    }
                    shot.recycle();
                    final boolean done = ok;
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (done) {
                                Inbox.addMedia(BubbleService.this, "screenshot", out.getName(), s(R.string.screenshot));
                                toast(s(R.string.shot_saved));
                            } else {
                                out.delete();
                                toast(s(R.string.shot_save_failed));
                            }
                        }
                    });
                }
            }).start();
        } catch (Exception e) {
            toast(s(R.string.shot_failed));
        }
    }

    private void endProjection() {
        try {
            if (vd != null) vd.release();
        } catch (Exception ignored) {
        }
        vd = null;
        try {
            if (held != null) held.close();
        } catch (Exception ignored) {
        }
        held = null;
        try {
            if (reader != null) reader.close();
        } catch (Exception ignored) {
        }
        reader = null;
        MediaProjection p = projection;
        projection = null;
        try {
            if (p != null) p.stop();
        } catch (Exception ignored) {
        }
        if (running) {
            try {
                refreshForeground(false);
            } catch (Exception ignored) {
            }
        }
    }
}
