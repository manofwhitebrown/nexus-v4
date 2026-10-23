package com.nexus.personal;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

/**
 * A see-through screen that exists only to ask Android for two things the floating bubble cannot
 * ask for itself: permission to use the microphone, and permission to capture the screen.
 */
public class ActionActivity extends Activity {

    @Override
    protected void attachBaseContext(android.content.Context base) {
        super.attachBaseContext(Loc.wrap(base));
    }
    private static final int REQ_MIC = 11;
    private static final int REQ_PROJECTION = 12;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        String what = getIntent().getStringExtra("what");
        if ("mic".equals(what)) {
            if (Build.VERSION.SDK_INT >= 23
                    && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            } else {
                finish();
            }
        } else if ("projection".equals(what)) {
            try {
                MediaProjectionManager m = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
                startActivityForResult(m.createScreenCaptureIntent(), REQ_PROJECTION);
            } catch (Exception e) {
                BubbleService.shotPending = false;
                Toast.makeText(this, getString(R.string.capture_unsupported), Toast.LENGTH_LONG).show();
                finish();
            }
        } else {
            finish();
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == REQ_MIC) {
            boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            Toast.makeText(this, ok ? getString(R.string.mic_allowed)
                    : getString(R.string.mic_off),
                    Toast.LENGTH_LONG).show();
        }
        finish();
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == REQ_PROJECTION) {
            if (result == RESULT_OK && data != null) {
                Intent s = new Intent(this, BubbleService.class)
                        .setAction(BubbleService.ACTION_PROJECTION)
                        .putExtra("code", result)
                        .putExtra("data", data);
                try {
                    if (Build.VERSION.SDK_INT >= 26) startForegroundService(s);
                    else startService(s);
                } catch (Exception e) {
                    BubbleService.shotPending = false;
                    Toast.makeText(this, getString(R.string.capture_failed), Toast.LENGTH_LONG).show();
                }
            } else {
                BubbleService.shotPending = false;
                Toast.makeText(this, getString(R.string.capture_denied), Toast.LENGTH_SHORT).show();
            }
        }
        finish();
    }
}
