# ORBIT 3.0 — Windows Desktop Assistant

**Status: Windows build candidate.** ORBIT 3.0 is a new **C# / .NET 10 + WebView2** Windows application, not Tauri. It is designed to run by double-clicking `ORBIT.exe` without a terminal, Node.js, Rust, or a development server. The distribution has one executable plus an optional standard Windows installer.

> This archive contains **build-ready source code**, not an already compiled EXE. UI browser tests passed. The native Windows build, Windows speech, installer, and real Azure/Supabase connections have **not yet been verified on a Windows PC**.

## Get your actual ORBIT.exe without installing a compiler locally

1. Create a **new GitHub repository for Windows ORBIT**, separate from `orbit-mobile` (do not modify your iPhone GitHub Pages repository).
2. Upload the **contents of this folder** to the *root* of the Windows repository. You should see `Native`, `Web`, `Assets`, `Installer`, `.github`, and `BUILD_WINDOWS.bat` in its Code tab. Make sure `.github/workflows/build-windows.yml` is uploaded as well. GitHub website upload might hide dot folders; GitHub Desktop or `git` makes this easier.
3. In that repository, open **Actions → Build ORBIT 3.0 for Windows → Run workflow**. The workflow runs on a real Windows build worker and packages the app.
4. Once the workflow succeeds, open its run, find **Artifacts → ORBIT-3.0-Windows**, and download the ZIP. It is expected to contain **`ORBIT.exe`** and **`ORBIT_3_0_Setup.exe`**. Extract it and use the installer for normal installation, or run the EXE standalone.

**If the Actions tab does not offer Run workflow:** check `.github/workflows/build-windows.yml` exists at the correct path on the main branch, and enable Actions for the repository.

**Alternative local build (Windows):** install **.NET 10 SDK**, and optionally **Inno Setup 6**, then double-click `BUILD_WINDOWS.bat`. The executable will be created in `Publish/ORBIT.exe` and the optional installer in `Release/ORBIT_3_0_Setup.exe`. Development tools are needed **only for building**, not for users installing/running ORBIT. Windows must have the Microsoft Edge WebView2 Runtime (present on most current Windows systems; if missing, install it).

## Voice engines

- **Windows voice · offline (default).** Uses Windows' installed text-to-speech voices, with language matching. To hear Romanian, install a compatible Romanian speech voice in Windows language/speech settings. Merely changing ORBIT's language does **not** install a Romanian voice. If Windows doesn't expose an appropriate Romanian speech voice, ORBIT reports that instead of substituting English speech.
- **Microsoft Neural · online (optional).** New high-quality English and Romanian voices via **official Azure AI Speech**: English Andrew/Ava, Romanian Emil/Alina. Requires internet **and your own Azure Speech resource, region, and resource key**, which may have associated usage charges. In **Settings → Speech engine**, select Microsoft Neural, enter your region/key, select voice, and save. The key is encrypted locally for your Windows user via DPAPI, not included in the app/source.
- The old **Piper** startup path is gone, including its Romanian phonemizer crash. This avoids startup failure; it does **not** mean the old Piper model itself was repaired. Cloud speech is optional: ORBIT launches without Azure credentials.
- Voice control/speech is limited to the **Windows** ORBIT app; the iPhone app stays voice-free.

## Carrying your settings and reminders forward

This is a **new Windows application platform** with a new WebView2 profile. Old Tauri `localStorage` is *not migrated automatically*.

1. Before switching, launch **ORBIT 2.8.1**, open **Reminders** and click **Export backup**. Save the JSON file. Keep your original 2.8.1 folder as a backup.
2. Install/open ORBIT 3.0, create a local profile, open **Reminders**, and choose **Import old backup** to restore reminders and app presets. Importing *replaces* your current local reminders and presets.
3. Re-enter Windows-only preferences such as voice/appearance if necessary.

Existing app presets point to local Windows apps/shortcuts. Those programs must still be installed at the same locations for presets to launch.

## Optional PC ↔ iPhone cloud sync

1. Run the previously provided `supabase_setup.sql` successfully in your **Supabase project** (only once).
2. In ORBIT 3.0 **Settings → ORBIT Cloud**, enter the **Supabase Project URL** and **publishable key** (`sb_publishable_...`) used by ORBIT Mobile. Click **Save connection**.
3. In the same section, enter the **same ORBIT Cloud email/password** that you use on the iPhone and click **Sign in**. Email confirmation may be required.
4. Reminders and selected appearance/language preferences sync while the app is running and internet is available. Timer progress, Windows presets, and voice settings are local-only. Cloud sync has not been tested against your live project in this build.

**Never enter a `sb_secret_` key or a `service_role` key into the app or public GitHub repository.** The publishable key is meant for clients; security depends on properly configured Supabase Row Level Security (RLS) from the SQL setup.

## Data location and troubleshooting

- User data / browser profile / voice key / logs: `%LOCALAPPDATA%\ORBIT\`
- Error log: `%LOCALAPPDATA%\ORBIT\error.log`
- On Windows 10, the WebView2 Runtime may need installing; the .NET runtime is embedded in the published app.
- If your screen is blank, confirm WebView2 Runtime is installed and inspect `error.log`.
- Some background metrics use hidden PowerShell for compatibility; **no terminal window is shown** and PowerShell is not a launcher.
- The release installation folder is intentionally minimal (one main EXE). User data is stored outside that directory and is retained when upgrading. There are no bundled Piper files, old patch ZIPs, Tauri folders, or development scripts in the installed application.
- The app is currently **unsigned**. Windows SmartScreen may warn on unfamiliar unsigned software. Code signing is a later release task.

## Development layout

`Native/` contains the Windows app and voice host, `Web/` contains the existing ORBIT dashboard, `Installer/` is Inno Setup config, `Assets/` has the icon, and `.github/workflows/` is the automated Windows build. The user-facing installed app is separate from these source files.
