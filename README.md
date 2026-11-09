# Habit

Before you start studying, spend one minute recalling a formula, a proof, or a fact.
Habit uses a **spaced-repetition schedule** to pick the one card you most need to review right now.

> The app's interface is in Chinese. Button names are given below in English with the Chinese label in parentheses.

## Features

- **One card at a time**: open the app and you immediately see what to review, with no intimidating queue
- **Recall first, then reveal**: the title and an optional hint come first and the answer after, so you practice active recall
- **Scheduled by the forgetting curve**: uses [FSRS](https://github.com/open-spaced-repetition/fsrs4anki), the open-source scheduler Anki uses today; the better you know a card, the longer the gap before it comes back
- **Math-friendly**: titles, hints, and answers all support LaTeX, answers also support Markdown, and the editor shows a live preview
- **Images in titles**: good for "what function is this graph?" cards; paste a screenshot straight into the title field
- **Any material**: type text, paste screenshots, attach PDFs, or bulk-import `.md` files
- **Fully local**: your data stays on your device, with no account and no network access
- **Light and dark mode**, switched automatically with your system
- **Runs on macOS, Windows, and Android**

## Install

All builds are on the [Releases](https://github.com/liuzhu374/habit/releases/latest) page.

### Windows

1. Download `Habit-windows-x64.zip` (Windows 10 / 11, 64-bit)
2. Unzip it anywhere (e.g. `D:\Habit`) and double-click **Habit.exe**. No installer is needed; right-click Habit.exe → *Send to → Desktop (create shortcut)* if you like
3. On first launch Windows may show *"Windows protected your PC"* because the app is not code-signed. Click *More info* → *Run anyway*
4. To update, replace the folder with the new version. Your data is not affected

### macOS

1. Download `Habit-mac-arm64.zip` (Apple silicon Macs)
2. Unzip it and drag **Habit.app** into *Applications*
3. On first launch macOS may say it cannot verify the developer, because the app is not notarized. Either:
   - open *System Settings → Privacy & Security* and click *Open Anyway* near the bottom, or
   - run in Terminal:
     ```bash
     xattr -dr com.apple.quarantine /Applications/Habit.app
     ```

### Android

1. Download `Habit-android.apk` (Android 7.0 or later)
2. Open the file on your phone. The first time, Android will ask you to allow installing apps from this source (your browser or file manager); allow it
3. To update, install the new APK over the old one. Your data is kept

## Usage

### Before each study session

1. Open Habit and read the **title** of today's card, plus the optional hint (e.g. "write down the mean and variance")
2. **Recall the full answer** in your head or on scratch paper
3. Tap **Reveal** (翻开看看), compare with the answer, and rate yourself:

| Button | Meaning | Comes back |
|---|---|---|
| 😵‍💫 **Forgot** (忘了) | Couldn't recall it | First thing next time you open Habit |
| 🤔 **Fuzzy** (模糊) | Recalled part of it | After a short gap |
| 😎 **Got it** (记得) | Recalled all of it | After a growing gap: roughly 3 days → 11 days → 39 days → 4 months… |

Each button shows when the card will come back. **Forgot** has no fixed time: the card won't be asked again during the current session, and the next time you open Habit (reopen the window, or come back after more than 30 minutes) it is shown before anything else. After rating, choose **One more** (再来一个) or **Go study** (去学习吧).

**Keyboard shortcuts** (desktop): `Space` reveal · `1` `2` `3` rate · `N` one more · `⌘S` / `Ctrl+S` save while editing

### How the next card is chosen

Every card tracks a *stability* and a *difficulty*, from which Habit estimates **how likely you are to remember it right now**. Then:

1. **If any cards are due**: cards you last marked *Forgot* go first, then the card you are closest to forgetting
2. **If nothing is due**: a new card is introduced (at most 3 per day, configurable in settings)
3. **If there are no new cards either**: the card you know least well, for extra practice

**Skip** (换一个) only skips a card for the current session and does not affect its schedule.

### Adding cards

In **Library** (资料库), click **＋ New** (新建) and fill in:

- **Title**: the question you see first, e.g. "PDF of the normal distribution". It can contain math (`Gaussian integral $\int_{-\infty}^{\infty} e^{-x^2}\,dx$`) and images: click **Add image to title** (给标题加图片) below the field, or paste / drag a screenshot into it. Images appear in the title as `![](/uploads/…)` and can be mixed with text and formulas
- **Subject**: for grouping, e.g. "Probability"
- **Hint** (optional): shown before revealing, e.g. "write the density, mean, and variance"; also supports math and images
- **Content**: the answer, in Markdown and LaTeX

Math syntax: inline `$x^2$`, display `$$\int_0^1 f(x)\,dx$$`; `\( \)` and `\[ \]` also work. Math in titles and hints is always typeset inline.
Built-in macros: `\R` `\N` `\Z` `\Q` `\C` (blackboard bold), `\E` `\P` (expectation, probability), `\Var` `\Cov`.

### Importing files

In the library, click **Import** (导入文件) or drag files into the window:

| File | Result |
|---|---|
| `.md` `.markdown` `.txt` | Each top-level heading `# Title` becomes a card; a file without one becomes a single card named after the file |
| Images `.png` `.jpg` `.jpeg` `.gif` `.webp` | One card per image, named after the file |
| `.pdf` | One card per file; the PDF is shown inside the card |
| `.json` | Restores a Habit backup |

While editing, you can also **paste screenshots** or drag images and PDFs into the editor. Maximum file size is 50 MB.

On Android, importing and inserting images use the system file picker; tapping an image opens it full screen, and the back button closes it.

## Data and backups

Everything is stored locally: on macOS in `~/Library/Application Support/Habit/data/`, on Windows in `%APPDATA%\Habit\data\`.

```
data/
├── library.json   # all cards and review history
├── uploads/       # images and PDFs
└── backups/       # one automatic backup per day, kept for 14 days
```

**Library → Settings & backup** (设置与备份) lets you export a backup, restore one, or open the data folder. To move to a new computer, export a backup and restore it there; if you have images or PDFs, copy the `uploads/` folder too.

On Android, data lives in the app's private storage with the same layout and the same daily backups. **Export** opens the system share sheet, so you can save the backup to cloud storage or send it to another device. Backups currently contain text and review history only, **not images or PDFs**, so cards with images need their images re-attached when moving between devices.

## Building from source

Requires [Node.js](https://nodejs.org/) 20 or later.

```bash
git clone https://github.com/liuzhu374/habit.git
cd habit
npm install
npm test
```

### macOS

```bash
npm run install-app    # build and install to /Applications/Habit.app
npm run zip            # or: build dist/Habit-mac-<arch>.zip
```

### Windows

This works from a Mac too; no Windows machine is needed.

```bash
npm run zip-win        # builds dist/Habit-windows-x64.zip
```

### Android

Requires JDK 21 and the Android SDK (platform 36, build-tools). On macOS:

```bash
brew install openjdk@21 && brew install --cask android-commandlinetools
export JAVA_HOME=$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=~/Library/Android/sdk
sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-36" "build-tools;36.0.0"
npm run android        # builds dist/Habit-android.apk
```

The signing key is not part of the repository. Set `HABIT_STORE_FILE`, `HABIT_STORE_PASSWORD`, `HABIT_KEY_ALIAS`, and `HABIT_KEY_PASSWORD` in `~/.gradle/gradle.properties` to get a signed APK; without them the APK is unsigned and cannot be installed.

### Project layout

```
electron/main.js   desktop (macOS / Windows) shell: starts the local server and opens the window
server.js          desktop local server (listens on a random 127.0.0.1 port)
lib/api.js         API logic shared by desktop and Android
lib/srs.js         FSRS scheduling, card selection, stats
lib/store.js       desktop storage: atomic writes and daily backups
public/            UI (plain JavaScript, no build step)
public/native.js   Android backend: storage, images, PDFs (pdf.js), back button
android/           Android project (Capacitor)
scripts/           copies the UI into www/ for the Android build
build/             app icons
test/              tests
```

## License

[MIT](LICENSE)
