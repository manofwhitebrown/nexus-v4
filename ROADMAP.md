# Nexus roadmap: plan vs. what is built

Status: done, partial, not started.

| Card | Status | Built | Still missing |
| --- | --- | --- | --- |
| 01 Home                    | done    | Greeting, Now card, Then, loose ends, recap, backup reminder, get-started card, Android home-screen widget with a tick for each task and quick add | None |
| 02 Universal search | partial | Tasks, notes, links, ideas, projects, flashcards, attachment names, AI-read file text | Voice transcription |
| 03 Quick capture           | done    | Text, link, idea, photo, screenshot, voice, file, auto-filing into projects and study subjects, share from other apps (links and text), home-screen shortcuts, dictation, widget and quick-settings tile, lock-screen quick add | Sharing files from other apps. AI auto-filing is built (optional, your own key, with Undo) |
| 04 Nexus AI | partial | Offline Find, plan, summarise, compare, history; optional AI answers, explain, read files | Saved AI chats per project, semantic search |
| 05 Study | done | Subjects, flashcards, spaced repetition, chapters, material, exam date, study sessions, time studied, **a separate question bank (multiple choice) with an AI question button** | None |
| 06 Projects | done | Description, deadline, files, recent activity, tasks, notes, links | AI chats per project |
| 07 Tasks                   | partial | Due dates, projects, promised flag, repeating tasks, explicit links, start time and length, time-blocking on the Plan screen, reminders at the start time (and at a chosen hour for dated tasks with no time), "at 5pm" and "in 2 hours" phrases, **priorities, steps inside a task, priority filter and sort, Week view, streak line** | Steps from the widget |
| 08 Files | partial | Files view in Library, photos, voice, files, collections, **inline PDF viewer, folders** (where the browser can show PDFs) | Nothing big |
| 09 Saved | partial | Links with domain, share-to-Nexus, Saved collection | Page titles and thumbnails |
| 10 Timeline | done | Created, edited, finished, focused; ask "what was I doing on Sunday"; clear timeline | None |
| 11 Command center | done | Top bar commands, command sheet, pull down from the top | Voice commands |
| 12 Focus mode              | done    | Timer that survives screen lock, pause, logging of minutes, a disc that shrinks as time runs out, **5 minute break, screen wake lock, long-break cycles (every 2 to 8 sessions, lengths in Settings)** | None |
| 13 Recap | done | Today ring, 7-day chart, week totals, tomorrow preview, **monthly recap** | None |
| 14 Personalization | partial | Dark, light, match phone; four accents; three text sizes; **the Android floating bubble and its note panel follow the theme and accent live**; **a Settings gear in the header on every tab** | None. Wallpaper (presets or your own picture), layout and navigation style are in Settings. Since 3.7 the accent colour reaches every tab, including the Library (it used to reach almost nothing) |
| 15 The Nexus (connections) | done | Automatic related items plus links you make, with backlinks, **graph view** | None |
| 16 Smart collections | done | Unfinished, overdue, saved, ideas, this week, untouched, study material, recently studied, exam material, **high priority, tasks with open steps, your own rules** | Rules in backups and sync |
| 17 Privacy | done | Local-first, PIN lock, encrypted backups, backup reminders, delete-all that wipes everything (vault, trash, restore points, attachments), **encryption at rest** with a recovery key, **sync** through a folder or your own Dropbox with end-to-end encryption, merge a backup file | Sync through Google Drive, background sync when the app is closed |
| 18 Tech foundation         | partial | Installable PWA, offline, shortcuts, share target, Android app with floating bubble (**tucks into the screen edge, follows theme, accent and language live**), the phone's Back button closes open sheets, widget, quick-settings tile, native reminders, calendar and speech bridges | Launcher mode, sync |
| 19 Sound | done | Soft synthesized tap, tick, done, open and close sounds; three styles and volumes; mute from the header, the `m` key or Settings; never while typing | Native-speaker read of the new Hindi and Telugu words; a longer focus-timer chime |

The PIN lock keeps casual snoopers out and does not encrypt anything. Encryption at rest (Settings > Encryption) does.

## Status against the four phases (October 2026)

| Phase | Status |
|---|---|
| 1. Design | Done. Flat graphite look, one typeface, phone type scale, side rail on laptops. |
| 2. Working app | Done as an installable web app (PWA). Home, Tasks, Notes, Study, Search, Capture, Projects, Files. Data stays on the device. |
| 3. Connect everything | Mostly done. Search and the command bar cover everything, items link by project, tag and topic, and Ask Nexus answers from your own data. Automatic sorting of captures is rule-based, not AI. |
| 4. Control more of the phone | Mostly. Shortcuts, a pinned quick-note notification, share target, and the Android app with a floating bubble, widget, tile and reminders are built. A launcher mode is not. |

## Status against the build plan (October 2026)

Written for what the code does. The author reports having tried all phases on a phone, and having had the Hindi and Telugu read by a native speaker; the tests cannot check either. The words added for Sound in 3.7 have not been read by a native speaker. The web side is covered by the browser tests (`npm test`).

| Phase | Status |
|---|---|
| 0. Make it unbreakable | Done in code: trash and undo for everything (30 days), automatic restore points, a second copy in IndexedDB, damaged-data recovery, a 5,000-item test, **Export as Markdown (zip: Tasks.md, Notes/, Study/)**, **import from Todoist (.csv), Google Keep (.json), Evernote (.enex) and Obsidian or Notion (.md files)**, a restore point before every import, and the browser tests now run on every push and before every APK build. Since 4.1: **Notion, Obsidian, Takeout and Evernote .zip files, and attachments from Evernote, Keep and Markdown notes** (8 MB each). |
| 1. Fastest capture on Android | Done in code: widget with quick add and tick-off, quick-settings tile, lock-screen quick add, launcher shortcuts, dictation, smarter dates, calm overdue (no red), command palette. Not done: transcription of recorded voice notes. |
| 2. Time | Done in code: phone calendar beside tasks, time-blocking by dragging, shrinking-disc timer, reminders as Android alarms. Done since: dragging tasks between days, a board view, reminders for tasks with a date but no time (default 9:00, changeable or Off in Settings) a week view, and since 4.1 a **week view with times**. |
| 3. Study and quiet intelligence | Done in code: **FSRS-5 scheduling** (Again/Hard/Good/Easy with the next gap shown, old cards converted, memory kept through backup), **cards made from notes** by rules (you review and tick them first), **smarter search** (word forms, close synonyms, typos, partial matches), **auto-tags** from tags and subjects you already use, shorter titles for long one-line notes, a gentle "looks similar" warning, and a **daily study plan** that spreads new cards over the days before an exam (20 new cards a day when no exam is set). Honest limits: search is rules and a small synonym list, not a neural model, so it will not find "car" from "automobile" unless listed; cards from notes need clear patterns like "Term: meaning" or "X is …"; Since 4.1: an AI card-making button and AI auto-filing of captures (your own key, nothing sent until you press or turn it on), and PDF text search without AI using a bundled pdf.js. |
| 4. Sync and encryption | Done in code: encryption at rest for the data, safe copy, trash, restore points, attachments and keys, with an unlock screen, recovery key, change of passphrase, auto-lock and safe turn-on/turn-off; sync through a folder or Dropbox with a field-level merge, sealed attachments and conflict retry; merge a backup file. Tested with simulated devices, a simulated folder and a simulated Dropbox. **Not yet tried against the real Dropbox or the Android app with encryption on.** Not done: Google Drive, background sync. |
| 5. Launch | Done in code: Hindi and Telugu for the web layer and the native Android screens (they follow the language chosen in Nexus), fonts bundled locally, a four-step first-run tour, accessibility pass (named dialogs, focus return, labelled groups, skip link), an AAB build script and a manual signing workflow, `PLAY_STORE.md`. Tests cover the language layer, the date fixes, the tour, accessibility and the Android string files. **Not done, and only you can do it:** native-speaker review of Hindi and Telugu, testing on real phones, a Play Console account, your own release keystore, screenshots and the feature graphic, a contact email in the store listing. Not tried: installing the bundle on a device, and Play's review of the overlay, screen-capture and microphone permissions. |

## What a web app cannot do

- Float over other apps or replace the home screen. Android only allows that to native apps (overlay permission, launcher role).
- Reliable reminders when the app is fully closed. In a browser that needs a server to send push messages. The Android app does it with its own alarms instead.

## Native Android

Started. The Android app in `android/` is a native wrapper (Java, built without Gradle) around this web app. It works offline, takes shared text from other apps, saves backups to Downloads, and adds a floating note bubble that stays over other apps. Notes typed in the bubble wait in a local inbox and appear in Nexus, tagged `bubble`.

Also built: a home-screen widget, quick-settings tile, quick add over the lock screen, launcher shortcuts, alarms for task reminders, and bridges for dictation and the phone calendar.

The bubble rests tucked into a screen edge (tap the tab to slide it out, tap again to write), and its colours and words follow the theme, accent and language chosen in Nexus without a restart. The phone's Back button closes an open sheet before it leaves the app.

Not done: a launcher mode, and a full native rewrite in Kotlin with Compose and Room. The APK and the Play bundle both build and validate in CI-style runs, but neither has been run on a device since Phase 4.

## Layout plan (from the UI research notes)

| Finding | Where Nexus stands |
|---|---|
| List first, calendar second | Tasks is a list; Plan and the new Week view are the calendar side. A board view (To do, Doing, Done) is built. |
| Sidebar on laptops, bottom tabs on phones | Built (side rail on laptops, tab bar on phones). |
| Quick add everywhere | Capture, the Add box on Tasks, Ctrl+K and `c`, and now Ctrl+Enter (Cmd+Enter) for Capture; widget, tile and lock-screen add on Android. |
| Priorities, filters and visual progress | Priorities, a priority filter and sort, steps with a count, the streak line, the Recap ring and bars. |
| Search anchors the experience | Search bar and command palette on every screen; typo-tolerant search. |
| Progressive disclosure | Encryption, sync, API key and reminder time live in Settings; the main screens show only the daily items. A gear in the header opens Settings from any tab. |
| Minimal Focus mode | Focus hides everything but the task and the shrinking disc; a break follows. |

## Version 4.0
Done: priorities, steps, Week view with dragging, Board view, your own rules (in backups and sync), folders, inline PDF viewer, Focus breaks and wake lock, reminders for dated tasks, project chats, page titles for links (Android). Backup restore keeps all the new fields.

Not done, and why: voice-note transcription (browsers and Android only transcribe live speech, not recordings), Google Drive sync (needs your own Google OAuth client), background sync with the app closed and launcher mode (native Android projects needing a phone to verify).

## Since 4.0: fixes from using it on a phone
Done:
- **Bubble theme.** The bubble's colours were fixed dark. Nexus now sends the page's real colours (theme and accent) to Android and the bubble, its panel and the hide target repaint at once.
- **Bubble language.** The bubble chose its language once, when it started, so switching language back left it stuck. Text is now looked up fresh each time, and the notification updates too.
- **Bubble at rest.** It tucks into the left or right edge with only a small tab showing; tap to slide out, tap again for the panel, and it tucks back in by itself. It remembers its side and height and survives rotation.
- **Back button.** Back used to leave the app from Capture, Add task or Settings. It now closes the open sheet first.
- **Settings gear.** A gear in the sticky header reaches Settings from every tab.
- **Download link.** The "Download the Android app" button in a browser pointed at the old `nexus-v3.3` releases; it now points at `nexus-v4`.

Not done, and why:
- The tucked-in bubble, the new colours and the Back button are covered by the tests and compile against the Android SDK, but have not been run on a real phone.
- Quick add (the small box over the lock screen) and the home-screen widget still use fixed colours; only the bubble follows the accent.
- Back on a main tab such as Tasks or Library still leaves the app instead of returning to Home.
- The longer Settings hint for the bubble has Hindi and Telugu written by Claude, not read by a native speaker.

## Version 4.1
Done: Focus long-break cycles, monthly recap, a separate Study question bank, Week view with times, graph of connections, wallpaper, layout and navigation options, PDF text search with a bundled pdf.js (`vendor/`), AI card and question buttons, optional AI auto-filing, zip import (Notion, Obsidian, Takeout, Evernote) and attachments from Evernote, Keep and Markdown notes. Code is in `v41.js` and `import2.js`; tests are in `tests/v41.mjs`.

Honest limits: the AI features are tested only against a fake provider, so real answers need your own key and are unchecked. PDF reading is tested with a stand-in reader; the real pdf.js has not been run in a browser here. Scanned PDFs have no text to find. Zip import needs a browser with `DecompressionStream` for compressed zips. Nothing in 4.1 has been tried on a phone.

## Version 4.2
Done and tested (`v42.js`, `tests/v42.mjs`, plus the share handler in `sw.js` and `manifest.webmanifest`):
- **Files shared from other apps.** The web share target now takes files as well as text and links (PDFs, pictures, audio, text, Word and Excel, up to 10 files of 8 MB). Each becomes a note tagged "shared" with the file attached. Text and link sharing works as before.
- **Voice commands.** A "Speak a command" button in the command palette (Ctrl+K). English phrases: "add task buy milk", "remind me to call mom", "note that the lab is on friday", "go to tasks", "search physics", "focus on essay", "mark milk done", "ask ...".

Not done, because they are Android app code that cannot be built or tried without a phone and the Android SDK: **steps from the widget, link thumbnails, background sync, and launcher mode.** Link thumbnails cannot be done in the web app at all (browsers block reading other sites' pictures). Launcher mode can stop the phone's home screen from working if it is wrong, so it should only be added with a phone in hand to test.
Sharing files from other apps through the Android app (not the installed web app) also still needs a change in the Android code.
