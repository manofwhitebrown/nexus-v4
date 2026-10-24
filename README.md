# Nexus 4.0

Made by Mohammed Abdul Nayeem.

A personal system for tasks, notes, links, projects, study and focus, all connected. Your data stays on your device (localStorage and IndexedDB), optionally encrypted with a passphrase. No server, no account.

**Ask Nexus** has two modes. *Find* runs on your device with no account or key (priorities, overdue, search). *Ask with AI* is optional and uses your own Anthropic API key; nothing is sent unless you press it.

## What is in this folder

| File | Purpose |
| --- | --- |
| `index.html` | The whole app (UI and logic), including the Settings gear in the header |
| `patch.js` | Second layer loaded after the app: backups with attachments, encrypted API key, Ask Nexus actions, file reading |
| `vault.js` | Loads first, in `<head>`. Optional encryption at rest (passphrase, recovery key, unlock screen), and the loader that starts every other script only after unlock. Shown in Settings > Encryption |
| `safety.js` | Safety net, loads right after the vault: 30-day trash, automatic restore points, damaged-data recovery, an IndexedDB safe copy of every save. Everything it stores is sealed when encryption is on. Shown in Settings > Safety net |
| `sync.js` | Sync between devices with no server: an encrypted sync file in a folder or your own Dropbox, a merge that keeps edits from both sides, and Merge a backup file. Shown in Settings > Sync |
| `portability.js` | Export as Markdown, and import from Notion, Evernote, Keep, Obsidian and Todoist |
| `study.js` | FSRS-5 spaced repetition for flashcards |
| `smart.js` | Search that forgives typos, cards made from notes, automatic tags, the daily study plan |
| `tests/`, `package.json` | `npm test` boots the real app in a simulated browser and checks the safety net, encryption, sync, dates, study and the rest. Runs on every push (`.github/workflows/test.yml`) |
| `i18n.js`, `i18n-data.js` | The language layer: English, Hindi and Telugu. Translates the app's own words, never yours. `i18n-data.js` is the dictionary to hand to a native speaker |
| `launch.js` | First-run tour (four steps, language first), the Language setting, and accessibility helpers (named dialogs, focus, labelled groups, skip link) |
| `fonts/`, `fonts.css` | Fonts bundled with the app (Familjen Grotesk, Noto Sans Devanagari, Noto Sans Telugu), so nothing loads from Google |
| `PLAY_STORE.md` | Google Play hand-off: listing text, data-safety answers, permission justifications, release checklist |
| `ai.js` | Free AI router: tries your Gemini, Groq, OpenRouter, Mistral and Cerebras keys in order and moves on when a limit is hit |
| `dates.js` | Smarter task dates: weekdays, "in 3 days", "every Monday", a few Hindi and Telugu words |
| `palette.js` | Command palette (Ctrl+K), `/` to search, `c` to capture |
| `capture.js` | Capture sheet (note, task, link, idea, photo, video, audio, file), numbered names, quick-note mode, notification shortcut, floating note, error guards |
| `offline.html`, `error.html`, `404.html` | Offline page, error page (`?code=503` and so on) and not-found page |
| `tasks2.js` | Priorities (high, medium, low) and steps inside a task, a priority filter and sort, a streak line, the Week view, a 5 minute break and a screen wake lock for Focus, the inline PDF viewer, two more smart collections, the reminder time for tasks with a date but no time (Settings), and Ctrl+Enter for Capture |
| `boards.js` | Board view (To do, Doing, Done) for all tasks or one project, dragging tasks to another day in the Week view (press and hold, or the Move button), your own smart collections from rules (kept on this device, not in backups), and folders for files in the Library |
| `projectchat.js` | Ask about one project: a chat kept with the project, sending only that project's items, using the same key or free providers as Ask Nexus |
| `titles.js` | Android app only: gives a saved link the page's title (set in Settings, off switch included) |
| `plan.js` | Time: start time and length for tasks, the Plan screen (drag a task onto the day, drag its edge to resize), phone calendar beside your tasks, the shrinking disc in Focus, and "at 5pm" / "in 2 hours" / "for 45 min" phrases |
| `phone.js` | Dictation button, the home-screen widget list, and task reminders handed to Android alarms (browser notifications when there is no Android app) |
| `features.js` | Files, recap, command center, study chapters, project details, repeating tasks, links, app lock, encrypted backups, appearance |
| `sound.js` | Soft tap sounds made on the device (no audio files): three styles, three volumes, a mute button next to the search bar, the `m` key, and Settings > Sound. Never plays while you type |
| `theme.css` | The graphite theme (monochrome, matches the logo; loaded after the app's own CSS) |
| `native.js` | Android app bridge: imports notes, recordings and screenshots from the floating bubble, bubble switch in Settings, saves backups to Downloads, tells Android the theme and accent colours so the bubble matches the app, and lets the phone's Back button close an open sheet |
| `sw.js` | Offline support and notification taps |
| `android/` | Source for the Android app (a web view around this app plus the floating bubble) |
| `.github/workflows/android.yml` | Runs the tests, builds the Android app on GitHub and publishes it as the latest release |
| `.github/workflows/aab.yml` | Manual: builds the signed Play Store bundle from your secrets |
| `android/build.sh`, `android/build-aab.sh` | Build the APK (debug-signed) and the Play bundle (your key) without Gradle |
| `manifest.webmanifest`, `icons/` | Makes it installable. `icons/logo.svg` is the mark, `icons/favicon.svg` follows the system theme |
| `privacy.html`, `terms.html`, `404.html` | Static pages |

File names are case-sensitive on GitHub Pages. Keep them exactly as above.

## Put it on GitHub Pages
1. Upload everything in this folder to the repo root (delete any old copies first).
2. Repo Settings > Pages > Source: "Deploy from a branch" > Branch: `main`, folder `/ (root)` > Save.
3. After a minute your app is live at `https://YOUR-USERNAME.github.io/nexus-v4/`.

## Install on your phone
Open that URL in Chrome on Android, then menu > Install app (or Add to Home screen). On iPhone use Safari > Share > Add to Home Screen.

## Updating
Edit the files, then bump `VERSION` in `sw.js` (for example `nexus-4.0.1`) so installed copies refresh.

## Android app with the floating bubble
A web page cannot float over other apps, so the Android app does it natively. It bundles this whole app, works offline, and adds a small bubble you can tap from any app to write a note. Notes wait in a local inbox and appear in Nexus the next time you open it, tagged `bubble`.

1. Every time you change the web files or `android/`, GitHub builds the app (Actions tab > Build Android app). You can also run it by hand with "Run workflow".
2. Download `nexus.apk` from the Releases page on your phone and open it. Android asks once to allow installs from your browser.
3. In the app: Settings > Floating bubble > Allow and turn on, then switch on "Display over other apps" for Nexus.
4. The bubble rests tucked into the left or right edge of the screen, so only a small tab shows and it is never in front of what you are reading. **Tap the tab** to slide the bubble out, then **tap it again** for a panel with a note box, **Record voice** and **Screenshot**. It tucks itself back in after a few seconds, after you close the panel and after a screenshot. Drag it up or down to move it, drop it near either side to keep it there, and drag it to the bottom target to hide it. It remembers its side and height, and stays tucked in when you rotate the phone.
5. A recording shows a red dot on the bubble until you stop it.

**Recording** needs the microphone permission, which Android asks for the first time you tap Record. **Screenshots** need Android's screen capture permission: tap Screenshot, allow it, and on Android 14 and newer choose **Entire screen** (choosing a single app only captures that app). While screenshots are ready, Android shows its normal screen-capture icon in the status bar. The bubble hides itself for a moment so it is not in the picture. Recordings and screenshots wait in the inbox and appear in Nexus as voice and photo items tagged `bubble`.

The app is signed with the key in `android/debug.keystore`, which is public. That is fine for a personal app you install yourself, and it lets new versions install over old ones. It is not suitable for the Play Store (see Releasing to Google Play below). The app has its own storage, separate from the browser: use Export backup in one and Restore backup in the other to move your items.

To build it yourself: `sudo apt-get install -y openjdk-21-jdk-headless aapt apksigner zipalign dalvik-exchange` and run `android/build.sh`.

### Theme and language in the bubble

The bubble and its note panel use the colours of the app: dark or light, and the accent you picked in Settings > Appearance. Nexus reads the real colours from the page and hands them to Android, so a change shows up in the bubble straight away (the colours are kept for the next time the bubble starts). The bubble's words follow the language in the same way: switching language in Nexus, in either direction, changes the bubble, its panel and its notification at once, with no restart.

### Language in the Android app

The web layer and the native screens (floating bubble, quick add, reminder notifications, widget text) both follow the language chosen in Nexus (Settings > Language). "Phone language" follows Android. The native strings live in `android/res/values/`, `values-hi/` and `values-te/` and must keep identical keys; `npm test` checks that, and that no English is left hard-coded in the Java files. The author had a native speaker read the Hindi and Telugu (reported by the author, not checked by the tests). The words added in 3.7 for Settings > Sound have not been read by a native speaker yet.

### Releasing to Google Play

Play needs a signed Android App Bundle (`.aab`), not the debug-signed APK above, and you must sign it with your own key.

1. Make an upload keystore once and keep it and its passwords out of the repo: `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`.
2. Build it on your machine: `NEXUS_KEYSTORE=upload.jks NEXUS_KEYSTORE_PASSWORD=... NEXUS_KEY_ALIAS=upload bash android/build-aab.sh` (needs the same packages as above, plus `aapt2`, which comes with the `aapt` package). The output is `android/build/nexus.aab`. The script refuses to run without a key; `ALLOW_DEBUG_SIGNING=1` makes a test-only bundle that Play will reject.
3. Or build it on GitHub: add the secrets `NEXUS_KEYSTORE_BASE64` (`base64 -w0 upload.jks`), `NEXUS_KEYSTORE_PASSWORD`, `NEXUS_KEY_ALIAS` and `NEXUS_KEY_PASSWORD`, then run Actions > Build Play Store bundle (AAB). The bundle is kept as a private workflow artifact for 14 days and is never published as a release.
4. Raise the version each upload: `VERSION_CODE` must grow every time (the workflow uses the run number).

`PLAY_STORE.md` has the listing text, the data-safety answers, the permission justifications and the checklist of what only you can do.

### Widget, quick add, shortcuts and reminders (Android app)

- **Home-screen widget.** Long-press the home screen, choose Widgets, then Nexus. It shows your next tasks with a tick for each, and a **+ Add** button. Ticks are applied the next time Nexus opens.
- **Quick add.** The widget's **+ Add**, the **Quick note** tile in the notification shade (edit the tiles to add it) and the **Quick add** launcher shortcut (long-press the app icon) all open a small box that also works over the lock screen. Words like "tomorrow at 5pm" are understood when Nexus next opens.
- **Share to Nexus.** In any app, Share > Nexus. Text becomes a note; photos, audio, video, PDFs, text files and Word or Excel files are copied into the app and saved as items tagged `shared` (up to 25 MB each, 20 at a time).
- **Plan day** is a second launcher shortcut that opens the Plan screen.
- **Reminders.** A task with a start time rings at that time with a **Done** button, even when Nexus is closed. Android may deliver one a few minutes late to save battery; Nexus uses inexact alarms on purpose so no special permission is needed. Reminders are put back after a restart or an update.
- **Dictation.** In Capture, **Dictate** opens Android's speech screen (English, Hindi or Telugu). Which languages work depends on the speech service on your phone.
- **Calendar.** On the Plan screen, **Allow calendar** shows events from your phone's calendars next to your tasks. Nexus only reads them on the phone and never saves them.

## Settings from every tab
Settings holds most of the controls, so a **gear** sits in the top-right corner of the header, next to the sound button. The header stays in place as you scroll, so Settings is one tap away from Home, Tasks, Library, Study and More, without going back to Home first.

## The Back button on Android
Back closes whatever sheet is open (Capture, Add task, Settings and so on) and keeps you in Nexus. Only when nothing is open does it go back in history, and only then does it leave the app. The PIN lock screen is left alone so Back cannot be used to get past it, and Back does not end a running Focus timer.

## Sound
Taps, ticks and sheets make a short, soft sound. They are made on the device with the browser's audio engine, so nothing is downloaded and it works offline. Settings > Sound has On/Off, three styles (Soft pop, Wood tap, Glass) and three volumes. For quick quiet, tap the speaker next to the search bar or press **m** (not while typing or with a sheet open). Sounds never play while you type, and never before your first tap. The choice is kept on the device. The Hindi and Telugu words for this section have not been read by a native speaker yet.

## Plan your day

Tasks can have a start time and a length. Give a task a time by typing "call Sam tomorrow at 5pm for 20 min", in the task editor, or on the Plan screen (Tasks tab > **Plan your day**, the command palette, or the **Plan day** shortcut). On Plan, drag a task from **To place** onto the day; on a phone, press and hold first so a swipe still scrolls. Or tap a task and then tap a time. Drag the bottom edge of a block to change its length; tap a block for exact times, Focus and Done.

## One copy per site
Every repo you publish on the same GitHub account shares one browser origin, so storage is now kept separately per copy (by its URL path). If you rename the repo or move it, export a backup first. Settings > Delete all data also clears leftovers from older copies.

## Backup
Your data lives on that device unless you turn on sync. Use Settings > Export backup now and then. Backups include attachments, so they can be large. **Export backup** is plain; **Export encrypted backup** asks for a passphrase. To combine a backup with what is already on a device, use Settings > Sync > **Merge a backup file**. It adds and never replaces.

## Encryption and sync

**Encryption at rest** (Settings > Encryption). Turn it on and Nexus asks for a passphrase every time it opens or locks. Your data, attachments, trash, restore points, saved API keys and sync settings are encrypted on the device with AES-GCM; the key is made from your passphrase with PBKDF2 (600,000 rounds). You get a one-time **recovery key**. If you lose both the passphrase and the recovery key, nothing can bring the data back, including the safe copy. Turning it on or off moves existing data safely and resumes if interrupted. It protects against someone reading the browser's storage, not against malware on an unlocked phone. The Android widget, reminders and quick-add inbox hand task text to Android outside this lock.

**Sync** (Settings > Sync, needs encryption on). Choose a folder (Chrome or Edge on a computer; the folder can live inside Dropbox, Drive, OneDrive or Syncthing) or your own Dropbox. Nexus writes one encrypted file plus one per attachment, sealed with a key made from a *sync passphrase* you choose; use the same one on every device. Edits to different parts of the same note on two devices are both kept, a deletion travels only if the other device did not touch the item, and anything removed by sync is in the trash for 30 days. Automatic sync runs when you open Nexus and about 20 seconds after you stop changing things.

Dropbox needs a free app of your own: create one at dropbox.com/developers/apps with **App folder** access and the `files.content.read` and `files.content.write` permissions, add your Nexus address as a redirect URI, and paste the App key in Nexus. Phones cannot pick a folder from the browser, and the Android app has no Dropbox sign-in (its address cannot be registered); on those, use Dropbox in the browser or installed web app, or combine devices with **Merge a backup file**, or use Nexus in the browser or as an installed web app.

Limits: encryption makes the stored data about a third larger, so the roughly 5 MB browser limit is reached sooner. If storage fills, Nexus keeps a safe copy and asks you to export.

See `ROADMAP.md` for what is built and what is still planned.
