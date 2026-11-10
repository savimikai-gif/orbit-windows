# ORBIT 3.0 — Changes from 2.8.1

- **Windows host:** Replaced the Tauri/Rust developer launcher with a C# / .NET 10 WinForms host using WebView2. App is published as a self-contained single-file Windows executable with no visible command prompt and an optional Inno Setup installer.
- **UI:** Reworked dashboard/panel layout spacing, responsive columns, focus outlines, consistent controls and slider alignment. Settings now separates Preferences from Profile, Appearance and Cloud panels. Kept live clock seconds and smooth stopwatch hundredths.
- **Voice:** Removed the old Piper voice preparation/dependency that crashed with the Romanian model. Added Windows native offline speech selection and optional official Azure neural speech with Andrew, Ava, Emil and Alina voices. The Azure Speech key is stored encrypted per Windows user; not bundled. Romanian offline voice requires Windows voice installation.
- **Cloud:** Brought Supabase configuration directly into Windows Settings. You can enter the publishable key in-app, not edit JS files. Integrated the previous reminders/preferences cloud sync module.
- **Data:** Added legacy ORBIT JSON backup import for reminders and app presets. User data remains under `%LOCALAPPDATA%\ORBIT`, not inside the installation folder.
- **Clean distribution:** Embeds the UI into the .NET assembly for build/publish, so an installed app need not expose HTML/CSS/JS, dev scripts, ZIP patches or old voice model files. Internet-dependent services stay optional.
- **Build & release:** GitHub Actions workflow and `BUILD_WINDOWS.bat` generate a Windows EXE; Inno Setup creates a per-user installer with Start menu/uninstall support.

## Validation and remaining risks

- Tested with Node.js static JS syntax checks and browser-automated Chromium desktop/narrow-width smoke tests. Screenshots available separately.
- NOT compiled or executed on Windows in the current environment. WebView2, WinForms, power monitoring, notification tray, file pickers, Azure Speech and Supabase integration require real Windows/provider tests. These are not guaranteed until that validation happens.
- Migrating from the old Tauri profile requires a JSON export/import. The local user profile/password does not transfer automatically.
- The app is not code-signed and auto-updates are not implemented in 3.0.
