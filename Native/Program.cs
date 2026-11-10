using System.Diagnostics;
using System.Text.Json;
using System.Windows.Forms;

namespace ORBIT;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => LogError(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => LogError(e.ExceptionObject as Exception ?? new Exception("Unexpected error"));
        try { Application.Run(new MainWindow()); }
        catch (Exception error) { LogError(error); MessageBox.Show("ORBIT could not start. Check %LOCALAPPDATA%\\ORBIT\\error.log.", "ORBIT", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    internal static string AppDataDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ORBIT");
    internal static void LogError(Exception error)
    {
        try
        {
            Directory.CreateDirectory(AppDataDir);
            File.AppendAllText(Path.Combine(AppDataDir, "error.log"), $"[{DateTime.Now:O}] {error}\n");
        }
        catch { /* Logging must never crash the app. */ }
    }
}
