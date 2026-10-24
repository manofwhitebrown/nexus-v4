package com.nexus.personal;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.CalendarContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Insets;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.TimeZone;
import java.util.Map;

/**
 * Hosts the Nexus web app (bundled in assets) in a WebView. Everything the web app stores stays
 * on the device. The native side adds the floating bubble, file picking, the microphone, and
 * saving backups to the Downloads folder.
 */
public class MainActivity extends Activity {

    @Override
    protected void attachBaseContext(android.content.Context base) {
        super.attachBaseContext(Loc.wrap(base));
    }
    static final String HOST = "appassets.androidplatform.net";
    private static final int REQ_FILE = 7, REQ_MIC = 8, REQ_NOTIF = 9, REQ_SPEECH = 13, REQ_CAL = 14;

    private WebView web;
    private FrameLayout rootView;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingMic;
    private boolean askedNotif; // ask for the notification permission once per launch, not on every change

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0D0D0E);
        rootView = root;
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        // Newer Android draws apps edge to edge. Keep the web app clear of the status bar,
        // the navigation bar, the camera cutout and the keyboard.
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                if (Build.VERSION.SDK_INT >= 30) {
                    Insets i = in.getInsets(WindowInsets.Type.systemBars()
                            | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                    v.setPadding(i.left, i.top, i.right, i.bottom);
                    return WindowInsets.CONSUMED;
                }
                v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(),
                        in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
                return in.consumeSystemWindowInsets();
            }
        });
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, new OnBackInvokedCallback() {
                        @Override
                        public void onBackInvoked() {
                            goBackOrClose();
                        }
                    });
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(false);

        web.setBackgroundColor(0xFF0D0D0E);
        // Start in the theme the app was last in, so the window never flashes the wrong colour.
        applyChrome(getSharedPreferences("nexus_ui", MODE_PRIVATE).getBoolean("light", false));
        web.addJavascriptInterface(new Bridge(), "NexusNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return serve(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> cb,
                                             FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = p.createIntent();
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                        p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(i, REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest r) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        boolean mic = false;
                        for (String res : r.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) mic = true;
                        }
                        if (!mic) {
                            r.deny();
                            return;
                        }
                        if (Build.VERSION.SDK_INT >= 23
                                && checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                                != PackageManager.PERMISSION_GRANTED) {
                            pendingMic = r;
                            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                        } else {
                            r.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                        }
                    }
                });
            }
        });

        web.loadUrl(startUrl(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        if (Intent.ACTION_SEND.equals(i.getAction()) || i.hasExtra("path")) web.loadUrl(startUrl(i));
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (getSharedPreferences("nexus", 0).getBoolean("bubble_on", false)
                && BubbleService.canDraw(this) && !BubbleService.running) {
            BubbleService.start(this);
        }
        if (web != null) web.evaluateJavascript("window.nxInbox&&window.nxInbox()", null);
    }

    @Override
    public void onBackPressed() {
        goBackOrClose();
    }

    private void goBackOrClose() {
        if (web != null && web.canGoBack()) web.goBack();
        else finish();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("NexusNative");
            web.destroy();
        }
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE && fileCallback != null) {
            Uri[] r = result == RESULT_OK
                    ? WebChromeClient.FileChooserParams.parseResult(result, data) : null;
            fileCallback.onReceiveValue(r);
            fileCallback = null;
            return;
        }
        if (code == REQ_SPEECH) {
            String text = "";
            int state = 2; // 0 = got words, 1 = no speech service, 2 = cancelled
            if (result == RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (r != null && r.size() > 0) {
                    text = r.get(0);
                    state = 0;
                }
            }
            if (web != null) {
                web.evaluateJavascript("window.nxSpeech&&window.nxSpeech(" + JSONObject.quote(text) + "," + state + ")", null);
            }
            return;
        }
        super.onActivityResult(code, result, data);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_MIC && pendingMic != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) {
                pendingMic.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                pendingMic.deny();
            }
            pendingMic = null;
            return;
        }
        if (code == REQ_CAL) {
            if (web != null) web.evaluateJavascript("window.nxCalReady&&window.nxCalReady()", null);
            return;
        }
        super.onRequestPermissionsResult(code, perms, res);
    }

    private String startUrl(Intent i) {
        String base = "https://" + HOST + "/";
        if (i != null && i.hasExtra("path")) {
            String path = i.getStringExtra("path");
            if (path != null && path.startsWith("?") && path.length() < 60) return base + path;
        }
        if (i != null && Intent.ACTION_SEND.equals(i.getAction())) {
            String text = i.getStringExtra(Intent.EXTRA_TEXT);
            String title = i.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text != null && text.length() > 0) {
                if (text.length() > 4000) text = text.substring(0, 4000);
                String q = "?text=" + Uri.encode(text);
                if (title != null && title.length() > 0) q += "&title=" + Uri.encode(title);
                return base + q;
            }
        }
        return base;
    }

    // ---------- serving the bundled web app ----------

    private static final Map<String, String> MIME = new HashMap<String, String>();

    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("ico", "image/x-icon");
        MIME.put("txt", "text/plain");
        MIME.put("woff2", "font/woff2");
        MIME.put("woff", "font/woff");
    }

    private WebResourceResponse serve(String path) {
        String p = path == null ? "" : path;
        while (p.startsWith("/")) p = p.substring(1);
        if (p.length() == 0) p = "index.html";
        if (p.contains("..")) p = "404.html";
        try {
            return asset(p, 200, "OK");
        } catch (Exception e) {
            try {
                return asset("404.html", 404, "Not Found");
            } catch (Exception e2) {
                return null;
            }
        }
    }

    private WebResourceResponse asset(String name, int code, String reason) throws Exception {
        InputStream in = getAssets().open(name);
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        WebResourceResponse r = new WebResourceResponse(mime, "UTF-8", in);
        r.setStatusCodeAndReasonPhrase(code, reason);
        Map<String, String> h = new HashMap<String, String>();
        h.put("Cache-Control", "no-cache");
        r.setResponseHeaders(h);
        return r;
    }

    // ---------- window colours follow the app theme ----------

    // The web page paints its own theme, but the window behind it, the status bar and the navigation
    // bar belong to Android. They used to stay dark in the light theme.
    private void applyChrome(boolean light) {
        int bg = light ? 0xFFE9E8E4 : 0xFF0D0D0E;
        if (rootView != null) rootView.setBackgroundColor(bg);
        if (web != null) web.setBackgroundColor(bg);
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        if (Build.VERSION.SDK_INT >= 23) {
            View d = getWindow().getDecorView();
            int f = d.getSystemUiVisibility();
            int bits = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) bits |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            d.setSystemUiVisibility(light ? (f | bits) : (f & ~bits));
        }
    }

    // ---------- bridge to the web app ----------

    private class Bridge {
        @JavascriptInterface
        public void fetchTitle(final String id, final String url) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    final String t = Titles.fetch(url);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (web != null) web.evaluateJavascript("window.nxTitle&&window.nxTitle(" + JSONObject.quote(id) + "," + JSONObject.quote(t) + ")", null);
                        }
                    });
                }
            }).start();
        }

        @JavascriptInterface
        public void setTheme(final String theme) {
            final boolean light = "light".equals(theme);
            getSharedPreferences("nexus_ui", MODE_PRIVATE).edit().putBoolean("light", light).apply();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    applyChrome(light);
                }
            });
        }

        /** The page's real colours (theme and accent) so the bubble can match the app. */
        @JavascriptInterface
        public void setPalette(String json) {
            if (json == null || json.length() > 2000) return;
            getSharedPreferences("nexus_ui", MODE_PRIVATE).edit().putString("palette", json).apply();
            BubbleService.refresh();
        }

        @JavascriptInterface
        public String inboxPeek() {
            return Inbox.peek(MainActivity.this);
        }

        @JavascriptInterface
        public String inboxMedia(String name) {
            return Inbox.mediaData(MainActivity.this, name);
        }

        @JavascriptInterface
        public void inboxAck(int n) {
            Inbox.ack(MainActivity.this, n);
        }

        @JavascriptInterface
        public String bubbleState() {
            if (!BubbleService.canDraw(MainActivity.this)) return "nopermission";
            return BubbleService.running ? "on" : "off";
        }

        @JavascriptInterface
        public String setBubble(final boolean on) {
            final boolean ok = BubbleService.canDraw(MainActivity.this);
            getSharedPreferences("nexus", 0).edit().putBoolean("bubble_on", on).apply();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (!on) {
                        stopService(new Intent(MainActivity.this, BubbleService.class));
                        return;
                    }
                    if (Build.VERSION.SDK_INT >= 33
                            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                            != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                    }
                    if (!ok) {
                        try {
                            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    Uri.parse("package:" + getPackageName())));
                        } catch (Exception ignored) {
                        }
                    } else {
                        BubbleService.start(MainActivity.this);
                    }
                }
            });
            if (!on) return "off";
            return ok ? "on" : "permission";
        }

        /** Dictation: opens Android's own speech screen and sends the words back to the page. */
        @JavascriptInterface
        public void listen(final String lang) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    if (lang != null && lang.length() > 0 && lang.length() < 12) {
                        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                    }
                    i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak now");
                    try {
                        startActivityForResult(i, REQ_SPEECH);
                    } catch (Exception e) {
                        web.evaluateJavascript("window.nxSpeech&&window.nxSpeech('',1)", null);
                    }
                }
            });
        }

        /** The few tasks the home-screen widget shows. */
        @JavascriptInterface
        public void setLang(String v) {
            String before = Loc.get(MainActivity.this);
            Loc.set(MainActivity.this, v);
            if (!before.equals(Loc.get(MainActivity.this))) {
                NexusWidget.refresh(MainActivity.this);
                BubbleService.refresh();      // the bubble's words follow the language at once
            }
        }

        @JavascriptInterface
        public void setSnapshot(String json) {
            Snap.write(MainActivity.this, json == null ? "[]" : json);
            NexusWidget.refresh(MainActivity.this);
        }

        /** Task reminders as Android alarms, so they fire when Nexus is closed. */
        @JavascriptInterface
        public void setReminders(final String json) {
            Reminders.set(MainActivity.this, json == null ? "[]" : json);
            if (!askedNotif && Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED
                    && json != null && json.length() > 2) {
                askedNotif = true;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                    }
                });
            }
        }

        @JavascriptInterface
        public String calendarState() {
            if (Build.VERSION.SDK_INT >= 23
                    && checkSelfPermission(Manifest.permission.READ_CALENDAR)
                    != PackageManager.PERMISSION_GRANTED) return "off";
            return "on";
        }

        @JavascriptInterface
        public void calendarAllow() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= 23) {
                        requestPermissions(new String[]{Manifest.permission.READ_CALENDAR}, REQ_CAL);
                    }
                }
            });
        }

        /** Events from the phone's calendars between two times, as JSON. All-day events carry a date. */
        @JavascriptInterface
        public String calendarEvents(long from, long to) {
            JSONArray out = new JSONArray();
            if (!"on".equals(calendarState())) return out.toString();
            Cursor c = null;
            try {
                c = CalendarContract.Instances.query(getContentResolver(),
                        new String[]{CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN,
                                CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY},
                        from, to);
                while (c != null && c.moveToNext() && out.length() < 200) {
                    JSONObject o = new JSONObject();
                    long b = c.getLong(1), e = c.getLong(2);
                    boolean allDay = c.getInt(3) == 1;
                    o.put("t", c.getString(0) == null ? "Busy" : c.getString(0));
                    if (allDay) {
                        o.put("ad", 1);
                        o.put("d", utcDate(b));
                        o.put("e", utcDate(e)); // the day after the last day
                    } else {
                        o.put("b", b);
                        o.put("e", e);
                    }
                    out.put(o);
                }
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.close();
            }
            return out.toString();
        }

        private String utcDate(long ms) {
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            cal.setTimeInMillis(ms);
            return String.format(java.util.Locale.US, "%04d-%02d-%02d", cal.get(Calendar.YEAR),
                    cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
        }

        @JavascriptInterface
        public String saveFile(String name, String dataUrl) {
            try {
                int comma = dataUrl.indexOf(',');
                if (comma < 0) return "Could not save the file.";
                String head = dataUrl.substring(0, comma);
                String mime = "application/octet-stream";
                int c = head.indexOf(':'), sc = head.indexOf(';');
                if (c >= 0 && sc > c) mime = head.substring(c + 1, sc);
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                String safe = name == null ? "nexus-file" : name.replaceAll("[^A-Za-z0-9._ -]", "_");
                if (safe.length() > 80) safe = safe.substring(0, 80);
                if (safe.length() == 0) safe = "nexus-file";
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) return "Could not save the file.";
                    OutputStream o = getContentResolver().openOutputStream(u);
                    o.write(bytes);
                    o.close();
                    return "Saved to Downloads as " + safe;
                }
                File dir = getExternalFilesDir(null);
                File f = new File(dir, safe);
                FileOutputStream o = new FileOutputStream(f);
                o.write(bytes);
                o.close();
                return "Saved to " + f.getAbsolutePath();
            } catch (Exception e) {
                return "Could not save the file.";
            }
        }
    }
}
