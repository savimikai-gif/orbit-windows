using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace ORBIT;

public sealed class MainWindow : Form
{
    private const string HostOrigin = "https://orbit.local/";
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    private readonly NotifyIcon tray = new() { Icon = System.Drawing.SystemIcons.Application, Text = "ORBIT 3.0", Visible = true };
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(16) };
    private readonly VoiceService voice = new();
    private readonly string webDir = Path.Combine(Program.AppDataDir, "WebCache", "3.0.0");
    private bool closeToTray;
    private bool reallyQuit;
    private bool fullscreen;
    private FormBorderStyle originalBorder;
    private FormWindowState originalState;
    private System.Drawing.Rectangle originalBounds;

    public MainWindow()
    {
        Text = "ORBIT 3.0";
        Size = new System.Drawing.Size(1360, 860);
        MinimumSize = new System.Drawing.Size(790, 550);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = System.Drawing.Color.FromArgb(9, 17, 29);
        try { Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); if (Icon is not null) tray.Icon = Icon; }
        catch { /* default window icon */ }
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open ORBIT", null, (_, _) => ShowFromTray());
        menu.Items.Add("Quit ORBIT", null, (_, _) => { reallyQuit = true; Close(); });
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += (_, _) => ShowFromTray();
        Controls.Add(browser);
        Shown += async (_, _) => await InitializeBrowser();
        FormClosing += (_, e) =>
        {
            if (closeToTray && !reallyQuit && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
        };
        FormClosed += (_, _) => { tray.Visible = false; tray.Dispose(); http.Dispose(); browser.Dispose(); };
    }

    private void ShowFromTray()
    {
        Show(); WindowState = FormWindowState.Normal; Activate();
    }

    private static readonly string[] WebFiles = [
        "index.html", "src/style.css", "src/main.js", "src/native-bridge.js", "src/cloud-sync.js", "src/cloud-config.js"
    ];
    private void ExtractWebResources()
    {
        Directory.CreateDirectory(webDir);
        var assembly = Assembly.GetExecutingAssembly();
        foreach (string relative in WebFiles)
        {
            using Stream resource = assembly.GetManifestResourceStream("orbit/" + relative)
                ?? throw new InvalidOperationException("Missing built-in UI resource: " + relative);
            string dest = Path.Combine(webDir, relative.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            // Overwrite on startup so app updates always replace the embedded UI without modifying user data.
            using var file = new FileStream(dest, FileMode.Create, FileAccess.Write, FileShare.None);
            resource.CopyTo(file);
        }
    }

    private async Task InitializeBrowser()
    {
        try
        {
            ExtractWebResources();
            var userProfile = Path.Combine(Program.AppDataDir, "WebView2");
            Directory.CreateDirectory(userProfile);
            var environment = await CoreWebView2Environment.CreateAsync(null, userProfile);
            await browser.EnsureCoreWebView2Async(environment);
            browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
            browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            browser.CoreWebView2.SetVirtualHostNameToFolderMapping("orbit.local", webDir, CoreWebView2HostResourceAccessKind.DenyCors);
            browser.CoreWebView2.WebMessageReceived += OnMessage;
            browser.CoreWebView2.NavigationStarting += (_, e) =>
            {
                if (!e.Uri.StartsWith(HostOrigin, StringComparison.OrdinalIgnoreCase))
                {
                    e.Cancel = true;
                    try { OpenWeb(e.Uri); } catch (Exception ex) { Program.LogError(ex); }
                }
            };
            browser.CoreWebView2.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                try { OpenWeb(e.Uri); } catch (Exception ex) { Program.LogError(ex); }
            };
            browser.CoreWebView2.Navigate(HostOrigin + "index.html");
        }
        catch (Exception error)
        {
            Program.LogError(error);
            MessageBox.Show("Could not initialize ORBIT. Install or repair the Microsoft Edge WebView2 Runtime and restart ORBIT.\n\n" + error.Message,
                "ORBIT startup error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string GetText(JsonElement args, string name, string fallback = "") =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.String
            ? item.GetString() ?? fallback : fallback;
    private static bool GetBool(JsonElement args, string name) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.True;
    private static double GetNumber(JsonElement args, string name, double fallback = 1) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var item) && item.ValueKind == JsonValueKind.Number && item.TryGetDouble(out var n) ? n : fallback;

    private async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // Only bundled UI pages may request privileged Windows operations.
        if (!e.Source.StartsWith(HostOrigin, StringComparison.OrdinalIgnoreCase)) return;
        int id = 0;
        try
        {
            using var json = JsonDocument.Parse(e.WebMessageAsJson);
            var root = json.RootElement;
            id = root.GetProperty("id").GetInt32();
            var cmd = root.GetProperty("cmd").GetString() ?? "";
            if (cmd.Length is < 1 or > 48) throw new InvalidOperationException("Invalid command.");
            var args = root.TryGetProperty("args", out var item) ? item.Clone() : default;
            object? answer = await HandleCommand(cmd, args);
            Reply(id, true, answer, null);
        }
        catch (Exception error)
        {
            Program.LogError(error);
            Reply(id, false, null, error.Message);
        }
    }
    private void Reply(int id, bool ok, object? result, string? error)
    {
        if (IsDisposed || browser.CoreWebView2 is null) return;
        browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { id, ok, result, error }));
    }
    private async Task<object?> HandleCommand(string cmd, JsonElement args)
    {
        switch (cmd)
        {
            case "open_url": OpenWeb(GetText(args,"url"));return true;
            case "pick_files": return PickFiles(GetBool(args,"multiple"));
            case "launch_app": LaunchApp(GetText(args,"path"));return true;
            case "list_installed_apps": return await Task.Run(InstalledApps);
            case "set_autostart": SetAutostart(GetBool(args,"enabled"));return true;
            case "get_autostart": return GetAutostart();
            case "set_close_to_tray": closeToTray=GetBool(args,"enabled");return true;
            case "show_notification":
                tray.BalloonTipTitle = GetText(args,"title").Substring(0, Math.Min(100, GetText(args,"title").Length));
                tray.BalloonTipText = GetText(args,"body").Substring(0, Math.Min(240, GetText(args,"body").Length));
                tray.ShowBalloonTip(4500);return true;
            case "toggle_fullscreen": return ToggleFullscreen();
            case "system_snapshot": return await SystemSnapshot();
            case "google_news_rss": return await FetchNews(GetText(args,"language"));
            case "azure_status": return voice.Status();
            case "set_azure_config": voice.Save(GetText(args,"region"),GetText(args,"key"));return true;
            case "clear_azure_config": voice.Clear();return true;
            case "azure_speak": return await voice.Synthesize(GetText(args,"text"),GetText(args,"voice"),GetNumber(args,"rate",1));
            default: throw new InvalidOperationException("Unsupported native command: " + cmd);
        }
    }

    private static void OpenWeb(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http"))
            throw new InvalidOperationException("Only HTTP(S) links may be opened.");
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute=true });
    }
    private object? PickFiles(bool multiple)
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Choose applications or shortcuts",
            Filter = "Windows applications and shortcuts (*.exe;*.lnk)|*.exe;*.lnk",
            Multiselect = multiple, CheckFileExists = true
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return null;
        return multiple ? dialog.FileNames : dialog.FileName;
    }
    private static void LaunchApp(string path)
    {
        if (!Path.IsPathFullyQualified(path) || !File.Exists(path)) throw new InvalidOperationException("Application path does not exist.");
        if (!new[]{".exe",".lnk"}.Contains(Path.GetExtension(path),StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only .exe and .lnk files can be launched.");
        Process.Start(new ProcessStartInfo(path) { UseShellExecute=true });
    }
    private static object InstalledApps()
    {
        var result = new List<object>();
        foreach (var dir in new[] {
            Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu),
            Environment.GetFolderPath(Environment.SpecialFolder.StartMenu)
        })
        {
            try
            {
                foreach (var file in Directory.EnumerateFiles(dir,"*.lnk",SearchOption.AllDirectories).Take(1800))
                {
                    result.Add(new { name = Path.GetFileNameWithoutExtension(file), path = file });
                    if(result.Count >= 1200) break;
                }
            }
            catch (Exception error) { Program.LogError(error); }
        }
        return result;
    }
    private static readonly string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private static bool GetAutostart()
    {
        using var reg = Registry.CurrentUser.OpenSubKey(RunKey);
        return reg?.GetValue("ORBIT") is string s && s.Contains("ORBIT.exe",StringComparison.OrdinalIgnoreCase);
    }
    private static void SetAutostart(bool enabled)
    {
        using var reg = Registry.CurrentUser.OpenSubKey(RunKey, true) ?? Registry.CurrentUser.CreateSubKey(RunKey);
        if(enabled)reg.SetValue("ORBIT", "\"" + Environment.ProcessPath + "\"");
        else reg.DeleteValue("ORBIT", false);
    }
    private bool ToggleFullscreen()
    {
        if(!fullscreen)
        {
            originalBorder=FormBorderStyle;originalState=WindowState;originalBounds=Bounds;
            FormBorderStyle=FormBorderStyle.None;WindowState=FormWindowState.Maximized;fullscreen=true;
        }
        else
        {
            WindowState=FormWindowState.Normal;FormBorderStyle=originalBorder;
            Bounds=originalBounds;WindowState=originalState;fullscreen=false;
        }
        return fullscreen;
    }
    private async Task<string> FetchNews(string language)
    {
        var uri=language=="ro"?"https://news.google.com/rss?hl=ro&gl=RO&ceid=RO:ro":"https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
        using var res=await http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead);
        res.EnsureSuccessStatusCode();
        if(res.Content.Headers.ContentLength>1_000_000)throw new InvalidOperationException("News response too large.");
        string xml=await res.Content.ReadAsStringAsync();
        if(xml.Length>1_000_000||!xml.TrimStart().StartsWith("<"))throw new InvalidOperationException("Invalid RSS response.");
        return xml;
    }
    private static async Task<string> SystemSnapshot()
    {
        const string script = @"
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$cpu=$null; $ram=$null; $usedGB=$null; $totalGB=$null; $gpu=$null
try { $c=Get-CimInstance Win32_Processor; $v=@($c | Where-Object { $null -ne $_.LoadPercentage } | ForEach-Object { [double]$_.LoadPercentage }); if ($v.Count -gt 0) {$cpu=[Math]::Min(100,[Math]::Max(0,($v | Measure-Object -Average).Average))} } catch {}
try { $os=Get-CimInstance Win32_OperatingSystem; $total=[double]$os.TotalVisibleMemorySize; $free=[double]$os.FreePhysicalMemory; if($total -gt 0) { $ram=[Math]::Round(100*($total-$free)/$total,1); $totalGB=[Math]::Round($total/1MB,2); $usedGB=[Math]::Round(($total-$free)/1MB,2) } } catch {}
try { $samples=@((Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop).CounterSamples); $agg=@{}; foreach($entry in $samples) { if($entry.Path -match 'engtype_([^\\]+)' -and $entry.CookedValue -ge 0) { $kind=$Matches[1]; if(-not $agg.ContainsKey($kind)){$agg[$kind]=0.0};$agg[$kind]+=[double]$entry.CookedValue } }; if($agg.Count -gt 0){$gpu=[Math]::Round([Math]::Min(100,($agg.Values | Measure-Object -Maximum).Maximum),1)} } catch {}
[pscustomobject]@{cpu=$cpu;gpu=$gpu;ram=$ram;memoryUsedGb=$usedGB;memoryTotalGb=$totalGB} | ConvertTo-Json -Compress
";
        string encoded=Convert.ToBase64String(System.Text.Encoding.Unicode.GetBytes(script));
        var psi=new ProcessStartInfo("powershell.exe")
        {
            Arguments="-NoProfile -NonInteractive -EncodedCommand " + encoded,
            UseShellExecute=false, CreateNoWindow=true,
            RedirectStandardOutput=true, RedirectStandardError=true,
            StandardOutputEncoding=System.Text.Encoding.UTF8
        };
        using var proc=Process.Start(psi)??throw new InvalidOperationException("Could not read system metrics.");
        Task<string> stdout=proc.StandardOutput.ReadToEndAsync();
        Task<string> stderr=proc.StandardError.ReadToEndAsync();
        using var cancel=new CancellationTokenSource(TimeSpan.FromSeconds(11));
        try { await proc.WaitForExitAsync(cancel.Token); }
        catch(OperationCanceledException) { proc.Kill(true); throw new TimeoutException("System metrics timed out."); }
        string data=await stdout;
        string errors=await stderr;
        if(proc.ExitCode!=0||!data.TrimStart().StartsWith("{"))throw new InvalidOperationException("System metrics unavailable: " + errors[..Math.Min(errors.Length,160)]);
        return data.Trim();
    }
}
