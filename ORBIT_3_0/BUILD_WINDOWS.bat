@echo off
setlocal
cd /d "%~dp0"
title ORBIT 3.0 - Windows release builder
where dotnet >nul 2>&1
if errorlevel 1 (
  echo .NET 10 SDK is not installed. Please install the .NET 10 SDK.
  echo https://dotnet.microsoft.com/download/dotnet/10.0
  pause
  exit /b 1
)
echo Building ORBIT 3.0 Windows application...
dotnet publish "Native\ORBIT.csproj" -c Release -r win-x64 --self-contained true -o "Publish" -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true
if errorlevel 1 (
  echo BUILD FAILED. Check the compiler output above.
  pause
  exit /b 1
)
if not exist "Publish\ORBIT.exe" (
  echo Could not find Publish\ORBIT.exe
  pause
  exit /b 1
)
echo.
echo Built: Publish\ORBIT.exe
echo You can now double-click ORBIT.exe. No command prompt is needed to run it.
echo.
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if exist "%ISCC%" (
  echo Building ORBIT Setup installer...
  "%ISCC%" "Installer\ORBIT.iss"
  if errorlevel 1 echo Installer failed. The standalone app was built successfully.
  if exist "Release\ORBIT_3_0_Setup.exe" echo Installer ready: Release\ORBIT_3_0_Setup.exe
) else (
  echo Optional: install Inno Setup 6, then run BUILD_WINDOWS.bat again to create the installer.
)
echo.
pause
