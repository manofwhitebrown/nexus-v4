package com.nexus.personal;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * A small box for jotting something down without loading the app: opened from the widget, the
 * quick-settings tile and the launcher shortcut. It also shows over the lock screen.
 * What you type waits in the inbox and is filed by Nexus the next time it opens.
 */
public class QuickAddActivity extends Activity {

    @Override
    protected void attachBaseContext(android.content.Context base) {
        super.attachBaseContext(Loc.wrap(base));
    }
    private EditText box;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true);
        float d = getResources().getDisplayMetrics().density;
        int p = (int) (20 * d);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(p, p, p, p);

        TextView h = new TextView(this);
        h.setText(R.string.quick_add);
        h.setTextSize(20);
        h.setTextColor(0xFFECECEA);
        root.addView(h);

        box = new EditText(this);
        box.setHint(R.string.quick_add_hint);
        box.setHintTextColor(0xFF9A9A9F);
        box.setTextColor(0xFFECECEA);
        box.setMinLines(3);
        box.setGravity(Gravity.TOP | Gravity.START);
        box.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        root.addView(box, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.END);
        row.addView(button(getString(R.string.cancel), "", false));
        row.addView(button(getString(R.string.save_note), "note", false));
        row.addView(button(getString(R.string.save_task), "task", true));
        root.addView(row);

        setContentView(root);
        getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        box.requestFocus();
    }

    private Button button(String label, final String kind, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(primary ? 0xFF0D0D0E : 0xFFECECEA);
        b.getBackground().setTint(primary ? 0xFFECECEA : 0x00000000);
        b.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (kind.length() > 0) save(kind);
                else finish();
            }
        });
        return b;
    }

    private void save(String kind) {
        String t = box.getText().toString().trim();
        if (t.length() == 0) {
            finish();
            return;
        }
        if (t.length() > 5000) t = t.substring(0, 5000);
        Inbox.add(this, t, kind);
        Toast.makeText(this, getString(R.string.saved_later), Toast.LENGTH_SHORT).show();
        finish();
    }
}
