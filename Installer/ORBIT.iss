; ORBIT 3.0 — clean per-user installer (no admin prompt)
#define AppName "ORBIT"
#define AppVersion "3.0.0"
[Setup]
AppId={{589B07EA-537F-4DBD-9AD5-7F8048FD1C6C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName=ORBIT 3.0
AppPublisher=ORBIT Project
DefaultDirName={localappdata}\Programs\ORBIT
DefaultGroupName=ORBIT
PrivilegesRequired=lowest
OutputDir=..\Release
OutputBaseFilename=ORBIT_3_0_Setup
Compression=lzma2
SolidCompression=yes
SetupIconFile=..\Assets\icon.ico
UninstallDisplayIcon={app}\ORBIT.exe
WizardStyle=modern
DisableProgramGroupPage=yes
CloseApplications=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
ChangesAssociations=no
VersionInfoVersion=3.0.0.0
[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
[Files]
Source: "..\Publish\ORBIT.exe"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{autoprograms}\ORBIT"; Filename: "{app}\ORBIT.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\ORBIT"; Filename: "{app}\ORBIT.exe"; Tasks: desktopicon; WorkingDir: "{app}"
[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "ORBIT"; Flags: uninsdeletevalue dontcreatekey; Check: IsWin64
[Run]
Filename: "{app}\ORBIT.exe"; Description: "Launch ORBIT"; Flags: nowait postinstall skipifsilent
