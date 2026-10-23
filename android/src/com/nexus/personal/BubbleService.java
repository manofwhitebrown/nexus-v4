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

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;

/**
 * A floating Nexus bubble that stays over other apps, like a screen recorder's controls.
 * Tap it to open a small panel for a note, a voice recording or a screenshot. Drag it anywhere.
 * Drag it to the bottom target to hide it. Everything goes to the Inbox and appears in Nexus the
 * next time the app is opened.
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
            addBubble();
            running = true;
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
            NotificationChannel ch = new NotificationChannel(CHANNEL, getString(R.string.bubble_channel),
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
        String text = recording ? getString(R.string.bubble_recording)
                : (projection != null ? getString(R.string.bubble_shots_ready) : getString(R.string.bubble_tap));
        b.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(getString(R.string.bubble_title))
                .setContentText(text)
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(0, getString(R.string.bubble_hide), stop);
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
            toast(getString(R.string.open_nexus_once));
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

    /**
     * The Nexus mark on a dark disc: the left half is solid and the right half is only an outline,
     * like something half hidden. A red dot shows while a voice note is being recorded.
     */
    private class LogoBubble extends View {
        private final Paint disc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path logo = new Path();
        private boolean red = false;

        LogoBubble(Context c) {
            super(c);
            disc.setColor(0xFF121214);
            ring.setStyle(Paint.Style.STROKE);
            ring.setColor(0xFF45454B);
            fill.setStyle(Paint.Style.FILL);
            fill.setColor(0xFFECECEA);
            line.setStyle(Paint.Style.STROKE);
            line.setColor(0xFFECECEA);
            line.setStrokeJoin(Paint.Join.MITER);
            dot.setColor(0xFFE8473C);
            float[] p = {0, 0, 22, 0, 44.5f, 58, 59, 0, 83, 0, 83, 94, 59, 94, 23, 36, 34, 94, 0, 94};
            logo.moveTo(p[0], p[1]);
            for (int i = 2; i < p.length; i += 2) logo.lineTo(p[i], p[i + 1]);
            logo.close();
        }

        void setRecording(boolean on) {
            red = on;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            float w = getWidth(), h = getHeight(), r = Math.min(w, h) / 2f;
            c.drawCircle(w / 2f, h / 2f, r, disc);
            ring.setStrokeWidth(dp(1));
            c.drawCircle(w / 2f, h / 2f, r - dp(0.5f), ring);
            float lh = h * 0.46f, sc = lh / 94f, lw = 83f * sc;
            c.save();
            c.translate((w - lw) / 2f, (h - lh) / 2f);
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
            if (red) c.drawCircle(w - dp(11), dp(11), dp(5), dot);
        }
    }

    private void addBubble() {
        bubble = new LogoBubble(this);
        bubble.setAlpha(0.96f);
        bubble.setContentDescription(getString(R.string.bubble_desc));

        int size = dp(54);
        bubbleLp = new WindowManager.LayoutParams(size, size, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        bubbleLp.gravity = Gravity.TOP | Gravity.LEFT;
        android.content.SharedPreferences p = getSharedPreferences("nexus", 0);
        bubbleLp.x = p.getInt("bubble_x", screenW - size - dp(6));
        bubbleLp.y = p.getInt("bubble_y", screenH / 3);
        clamp();

        bubble.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            int startX, startY;
            boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
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
                        if (!moved) {
                            openPanel();
                        } else {
                            boolean hide = nearClose();
                            hideCloseTarget();
                            if (hide) {
                                getSharedPreferences("nexus", 0).edit()
                                        .putBoolean("bubble_on", false).apply();
                                stopSelf();
                            } else {
                                snapToEdge();
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

    private void clamp() {
        int size = bubbleLp.width;
        bubbleLp.x = Math.max(0, Math.min(screenW - size, bubbleLp.x));
        bubbleLp.y = Math.max(dp(24), Math.min(screenH - size - dp(24), bubbleLp.y));
    }

    private void snapToEdge() {
        final int from = bubbleLp.x;
        final int to = (bubbleLp.x + bubbleLp.width / 2 < screenW / 2)
                ? dp(6) : screenW - bubbleLp.width - dp(6);
        ValueAnimator a = ValueAnimator.ofInt(from, to);
        a.setDuration(160);
        a.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator va) {
                if (bubble == null) return;
                bubbleLp.x = (Integer) va.getAnimatedValue();
                try {
                    wm.updateViewLayout(bubble, bubbleLp);
                } catch (Exception ignored) {
                }
            }
        });
        a.start();
        getSharedPreferences("nexus", 0).edit()
                .putInt("bubble_x", to).putInt("bubble_y", bubbleLp.y).apply();
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
        closeTarget.setTextColor(0xFFECECEA);
        closeTarget.setTextSize(26);
        closeTarget.setGravity(Gravity.CENTER);
        closeTarget.setBackground(circle(0xFF2E2E32));
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
        if (closeTarget != null) closeTarget.setBackground(circle(near ? 0xFFE8847C : 0xFF2E2E32));
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
        g.setColor(on ? 0xFFECECEA : 0xFF2E2E32);
        g.setCornerRadius(dp(6));
        t.setBackground(g);
        t.setTextColor(on ? 0xFF0D0D0E : 0xFFECECEA);
    }

    private void openPanel() {
        if (panel != null) return;
        bubble.setVisibility(View.INVISIBLE);

        panel = new Panel(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(14), dp(16), dp(16));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF161617);
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(1), 0xFF2E2E32);
        panel.setBackground(bg);

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText(R.string.quick_note);
        title.setTextColor(0xFFECECEA);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextSize(17);
        head.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        TextView x = new TextView(this);
        x.setText(R.string.close);
        x.setTextColor(0xFF9A9A9F);
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
        input.setHint(getString(R.string.type_note));
        input.setHintTextColor(0xFF9A9A9F);
        input.setTextColor(0xFFECECEA);
        input.setTextSize(16);
        input.setMinLines(3);
        input.setMaxLines(6);
        input.setGravity(Gravity.TOP | Gravity.START);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setPadding(dp(12), dp(10), dp(12), dp(10));
        GradientDrawable ib = new GradientDrawable();
        ib.setColor(0xFF0D0D0E);
        ib.setCornerRadius(dp(6));
        ib.setStroke(dp(1), 0xFF2E2E32);
        input.setBackground(ib);
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        ilp.topMargin = dp(10);
        panel.addView(input, ilp);

        LinearLayout chips = new LinearLayout(this);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        final String[] kinds = {"auto", "note", "task", "idea"};
        final String[] names = {getString(R.string.kind_auto), getString(R.string.kind_note), getString(R.string.kind_task), getString(R.string.kind_idea)};
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
        recBtn = button(getString(R.string.record_voice), 0xFF2E2E32, 0xFFECECEA);
        recBtn.setTextSize(14);
        TextView shot = button(getString(R.string.screenshot), 0xFF2E2E32, 0xFFECECEA);
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
        status.setTextColor(0xFF9A9A9F);
        status.setTextSize(13);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        slp.topMargin = dp(8);
        panel.addView(status, slp);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        TextView save = button(getString(R.string.save), 0xFFF6F6F4, 0xFF0D0D0E);
        TextView open = button(getString(R.string.open_nexus), 0xFF2E2E32, 0xFFECECEA);
        save.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String text = input.getText().toString().trim();
                if (text.length() == 0) {
                    status.setText(getString(R.string.type_first));
                    return;
                }
                if (text.length() > 5000) text = text.substring(0, 5000);
                Inbox.add(BubbleService.this, text, kind);
                input.setText("");
                status.setText(getString(R.string.saved_inbox));
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
        if (bubble != null) bubble.setVisibility(View.VISIBLE);
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
            recBtn.setText(getString(R.string.stop_fmt, (sec / 60 < 10 ? "0" : "") + (sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60)));
            recBtn.setTextColor(0xFFE8847C);
        } else {
            recBtn.setText(R.string.record_voice);
            recBtn.setTextColor(0xFFECECEA);
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
            say(getString(R.string.allow_mic));
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
            say(getString(R.string.recording_on));
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
            say(getString(R.string.record_blocked));
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
            Inbox.addMedia(this, "voice", recFile.getName(), getString(R.string.voice_note_title));
            if (!quiet) say(getString(R.string.saved_inbox));
        } else {
            if (recFile != null) recFile.delete();
            if (!quiet) say(getString(R.string.too_short));
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
            say(getString(R.string.allow_capture));
            openAction("projection");
            return;
        }
        closePanel();
        if (bubble != null) bubble.setVisibility(View.INVISIBLE);   // keep the bubble out of the picture
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                saveFrame();
                if (bubble != null) bubble.setVisibility(View.VISIBLE);
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
            toast(getString(R.string.capture_failed));
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
            toast(getString(R.string.no_picture));
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
                                Inbox.addMedia(BubbleService.this, "screenshot", out.getName(), getString(R.string.screenshot));
                                toast(getString(R.string.shot_saved));
                            } else {
                                out.delete();
                                toast(getString(R.string.shot_save_failed));
                            }
                        }
                    });
                }
            }).start();
        } catch (Exception e) {
            toast(getString(R.string.shot_failed));
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
