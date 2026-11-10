using System.Net.Http.Headers;
using System.Security;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace ORBIT;

/// <summary>
/// Official Azure Speech REST synthesis; no embedded/shared API keys.
/// The user's Azure resource key is encrypted with Windows DPAPI (CurrentUser).
/// Piper is deliberately not used: the prior Romanian model crashed its phonemizer.
/// </summary>
internal sealed class VoiceService
{
    private readonly string credentials = Path.Combine(Program.AppDataDir, "speech-credential.dpapi");
    private readonly string regionFile = Path.Combine(Program.AppDataDir, "speech-region.txt");
    private static readonly HttpClient Client = new() { Timeout = TimeSpan.FromSeconds(18) };
    private static readonly HashSet<string> ApprovedVoices = new(StringComparer.Ordinal)
    {
        "en-US-AndrewNeural", "en-US-AvaNeural", "ro-RO-EmilNeural", "ro-RO-AlinaNeural"
    };

    internal object Status()
    {
        string region=ReadRegion();
        return new { enabled=File.Exists(credentials)&&region.Length>0, region };
    }
    private string ReadRegion()
    {
        if (!File.Exists(regionFile)) return "";
        string region = File.ReadAllText(regionFile).Trim();
        return Regex.IsMatch(region,"^[a-z0-9-]{2,35}$",RegexOptions.IgnoreCase)?region:"";
    }
    private string LoadSecret()
    {
        if(!File.Exists(credentials))throw new InvalidOperationException("Azure Speech is not configured.");
        byte[] encrypted = File.ReadAllBytes(credentials);
        byte[] plain = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
        return Encoding.UTF8.GetString(plain);
    }
    internal void Save(string region,string key)
    {
        region = region.Trim().ToLowerInvariant();
        if(!Regex.IsMatch(region, "^[a-z0-9-]{2,35}$"))throw new InvalidOperationException("Invalid Azure region. Example: westeurope");
        if(key.Length>0 && (key.Length<16 || key.Length>256 || key.Any(char.IsWhiteSpace)))
            throw new InvalidOperationException("Invalid Azure Speech resource key.");
        if(key.Length==0 && !File.Exists(credentials))
            throw new InvalidOperationException("Enter the Azure resource key to configure neural speech.");
        Directory.CreateDirectory(Program.AppDataDir);
        if(key.Length>0)
        {
            byte[] clear = Encoding.UTF8.GetBytes(key);
            try { File.WriteAllBytes(credentials,ProtectedData.Protect(clear,null,DataProtectionScope.CurrentUser)); }
            finally { CryptographicOperations.ZeroMemory(clear); }
        }
        File.WriteAllText(regionFile,region);
    }
    internal void Clear()
    {
        if(File.Exists(credentials))File.Delete(credentials);
        if(File.Exists(regionFile))File.Delete(regionFile);
    }
    internal async Task<string> Synthesize(string text,string voice,double rate)
    {
        if(text.Length<1 || text.Length>600)throw new InvalidOperationException("Voice messages must be 1–600 characters.");
        if(!ApprovedVoices.Contains(voice))throw new InvalidOperationException("Unsupported neural voice.");
        string region = ReadRegion();
        if(region.Length==0)throw new InvalidOperationException("Add your Azure Speech region in Settings.");
        string key=LoadSecret();
        string language=voice[..5]; // en-US / ro-RO
        int pct=(int)Math.Round((Math.Clamp(rate,0.75,1.15)-1)*100);
        string rateText=pct>=0?"+"+pct+"%":pct+"%";
        string ssml = $"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{language}'><voice name='{voice}'><prosody rate='{rateText}'>{SecurityElement.Escape(text)}</prosody></voice></speak>";
        var uri = new Uri($"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1");
        using var req=new HttpRequestMessage(HttpMethod.Post,uri);
        req.Headers.Add("Ocp-Apim-Subscription-Key",key);
        req.Headers.Add("X-Microsoft-OutputFormat","riff-24khz-16bit-mono-pcm");
        req.Headers.UserAgent.ParseAdd("ORBIT/3.0");
        req.Content=new StringContent(ssml,Encoding.UTF8,"application/ssml+xml");
        using var response=await Client.SendAsync(req,HttpCompletionOption.ResponseHeadersRead);
        if(!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"Azure Speech returned {(int)response.StatusCode}. Check the region, key and subscription.");
        if(response.Content.Headers.ContentLength is long len && len>3_000_000)
            throw new InvalidOperationException("Voice audio is unexpectedly large.");
        byte[] audio=await response.Content.ReadAsByteArrayAsync();
        if(audio.Length>3_000_000 || audio.Length<44 || audio[0]!='R' || audio[1]!='I' || audio[2]!='F' || audio[3]!='F')
            throw new InvalidOperationException("Speech service did not return valid WAV audio.");
        return Convert.ToBase64String(audio);
    }
}
