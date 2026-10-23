# Play Store hand-off for Nexus

Everything here is a draft written from the code and `privacy.html` at version 3.4.0 (updated after the Phase 5 work). Google's forms and policies change, so read each answer against the Play Console wording before you submit. Items marked **CHECK** are ones I could not verify from the code.

## 1. Listing text

**App name** (30 characters max): `Nexus: Tasks, Notes, Study` (26)

**Short description** (80 max): `Private tasks, notes and flashcards. Works offline. No account.` (63)

**Full description** (4,000 max):

> Nexus keeps your tasks, notes and study cards in one calm place. Everything stays on your phone. There is no account, no server and no tracking.
>
> SAVE ANYTHING IN THREE SECONDS
> Tap Capture and type. Words like "tomorrow", #tags and @project sort it for you. Use the floating bubble, the home-screen widget, the quick-settings tile or the lock-screen shortcut to jot something down from any app.
>
> PLAN WITHOUT GUILT
> Home shows the one thing to do now, then what comes next. A task you miss stays in your list. It is never shown in red.
>
> STUDY FROM YOUR OWN NOTES
> Turn notes into flashcards. Nexus brings each card back just before you would forget it.
>
> YOURS, AND SAFE
> A 30-day trash and automatic restore points protect you from mistakes. Lock and encrypt everything with a passphrase. Export to Markdown or JSON, and import from Todoist, Google Keep, Evernote, Obsidian and Notion.
>
> OPTIONAL SYNC
> Sync between your devices through a folder you choose or your own Dropbox. Files are encrypted on your device before they leave it.
>
> IN YOUR LANGUAGE
> English, हिन्दी and తెలుగు.
>
> NO ADS. NO ACCOUNT. NO PAYWALL ON THE BASICS.

**CHECK:** "No paywall" and any price you plan (see the money decision in the research plan) must match what you actually ship.

**Category:** Productivity. **Tags:** to-do list, notes, flashcards.

**Developer name:** Mohammed Abdul Nayeem (or the name on your Play Console account; Play shows that one).

**Contact email:** required by Play and not in the repo. `privacy.html` only points to GitHub issues. Add a real email address.

**Privacy policy URL:** the hosted address of `privacy.html`.

## 2. Data safety form (draft answers)

| Question | Answer | Why |
|---|---|---|
| Does the app collect or share user data? | Collects none on its own servers. See notes below. | The privacy page says nothing is sent to the developer and there are no analytics. |
| Is all data encrypted in transit? | Yes | Cleartext traffic is off in the manifest (`usesCleartextTraffic=false`). |
| Can users request data deletion? | Yes, in the app | Settings has delete-all. Data never leaves the device unless the user turns on sync or AI. |
| Analytics, ads, tracking | None | Confirmed by the privacy page. |

**Notes to decide before answering.** Optional features send data to third parties only when the user turns them on and supplies their own key or account:

- Ask Nexus with AI: question and matching notes go to the provider the user chose (Anthropic, Gemini, Groq, OpenRouter, Mistral, Cerebras).
- Read with AI: one photo or PDF goes to Anthropic.
- Sync: encrypted files go to the user's own Dropbox or chosen folder.

Whether these count as "sharing" on the form depends on Google's definitions, which exempt some user-initiated transfers. **CHECK** the current definitions. If in doubt, declare them and describe them as optional and user-initiated.

## 3. Permissions and the justification for each

| Permission | Used for | Where in code |
|---|---|---|
| `SYSTEM_ALERT_WINDOW` | Draws the floating note bubble, only while the user has switched it on | `BubbleService` |
| `FOREGROUND_SERVICE` + `_SPECIAL_USE` | Keeps the bubble alive. Declared subtype: "Floating note bubble drawn over other apps so the user can jot notes" | `BubbleService`, manifest property |
| `FOREGROUND_SERVICE_MICROPHONE` + `RECORD_AUDIO` | Records a voice note when the user taps Record. The service only takes this type while recording | `BubbleService.startRecording` |
| `FOREGROUND_SERVICE_MEDIA_PROJECTION` | One screenshot when the user taps Screenshot. Android shows its own prompt each time | `BubbleService.startProjection` |
| `POST_NOTIFICATIONS` | Task reminders and the bubble's notification | `Reminders`, `BubbleService` |
| `RECEIVE_BOOT_COMPLETED` | Puts reminders and the bubble back after a restart | `BootReceiver` |
| `READ_CALENDAR` | Shows the phone calendar beside tasks, read only, never copied off the device | `MainActivity` (CalendarContract) |
| `INTERNET` | Optional sync, AI providers and links the user opens | web layer |
| `MODIFY_AUDIO_SETTINGS` | Not used by the Java code, but the web layer's **Record** button in Capture calls `getUserMedia` inside the WebView (`capture.js`), and WebView audio capture is generally documented as needing this permission. Kept on purpose. **CHECK** on a real phone: remove it, try Record in Capture, and drop it from the manifest only if recording still works | `capture.js` via WebView |

**Likely review friction.** The overlay, screen-capture and microphone foreground-service types are the permissions Play reviewers look at hardest. Be ready with:

- A short screen recording that shows each feature being switched on by the user, the system prompt, and the user stopping it.
- The special-use declaration text above, entered in the Play Console foreground-service form.
- A clear statement that screen capture happens only on tap, one frame at a time, and nothing records in the background.

I expect extra scrutiny here, but that is my understanding of how review works, not something I checked against current policy.

## 4. Release checklist (what only you can do)

1. **Release keystore.** Generate your own and keep it and its passwords out of the repo. The repo currently signs with a committed debug keystore (`android/debug.keystore`, password `android`). Never upload a build signed with that to Play. With Play App Signing, the key you sign with is only your upload key, but you still need to protect it.
2. **AAB build.** Done. `android/build-aab.sh` builds `android/build/nexus.aab` and signs it with the key named in `NEXUS_KEYSTORE*` environment variables; it refuses to run without one. The manual workflow `.github/workflows/aab.yml` does the same from four repository secrets (see the README, Releasing to Google Play). The bundle was checked with bundletool's `validate` and converted to an installable APK, but **not installed on a device**.
3. **Target API.** `build.sh` targets API 36. **CHECK** the current minimum target level in the Play Console before upload.
4. **Content rating** questionnaire, and the **target audience** (not for children).
5. **Screenshots** (phone, at least two), a 512×512 icon (`icons/icon-512.png` exists), and a 1024×500 feature graphic.
6. **Translations.** The author reports a native speaker has read the Hindi and Telugu in `i18n-data.js`. The words added in 3.7 for Sound (the block marked "NOT yet read by a native speaker") still need that read. The store listing in each language also needs translating.
7. **Real-phone testing** (the author reports this is done for all phases; repeat it for the 3.7 changes: sound, accent colours, and the window and status bar following the theme) of the bubble, widget, tile, reminders, calendar and boot behaviour on at least two Android versions.
8. **The flaky attachment test is explained.** It stored a file no item pointed to, reloaded, and read it back. At startup `patch.js` deletes attachment files that no item points to, so the test passed or failed on a race with that clean-up (reproduced: 12 of 12 failures with a short delay, 0 of 12 when an item points to the file). The app was behaving as designed; the test now attaches the file to an item and a second test checks the clean-up. One consequence worth knowing: a file attached in the Capture sheet but never saved is removed at the next start.
9. **Native strings follow the language chosen in Nexus** (not only the phone language) through `Loc.java` and the `setLang` bridge. Test it on a phone with the system in English and Nexus set to Hindi: the bubble, quick add, reminder button and widget text should all be Hindi.
