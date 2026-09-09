' Starts the kiosk watchdog with no console window, ever.
'
' Why this file exists. The scheduled task used to run powershell.exe directly.
' Task Scheduler gives it a console, and because the watchdog launches the booth,
' Electron and both Python backends inherit that console for their output - so it
' looks like an ordinary terminal full of ComfyUI and uvicorn logs sitting on the
' desktop. An operator closing it kills the watchdog and every process under it,
' which left the booth unsupervised after a single restart.
'
' Passing -WindowStyle Hidden does not help: the console exists before PowerShell
' can act on the flag. Hiding it from inside the script (GetConsoleWindow +
' ShowWindow) works when tested but depends on Add-Type compiling at runtime, and
' on at least one booth the window stayed visible anyway.
'
' WScript.Shell.Run with intWindowStyle 0 creates the process with its window
' hidden from the start. Nothing to hide after the fact, and no flash at logon.
' The console still exists, so the backends have somewhere to write - it is just
' never shown, and cannot be closed by someone who thinks it is spare.
'
' Usage:  wscript.exe kiosk-watchdog-launcher.vbs "<watchdog.ps1>" ["<Catherine.exe>"]

Option Explicit

Dim args, command, shell
Set args = WScript.Arguments

If args.Count < 1 Then
    WScript.Echo "Usage: kiosk-watchdog-launcher.vbs <path to kiosk-watchdog.ps1> [path to Catherine.exe]"
    WScript.Quit 1
End If

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & args(0) & """"
If args.Count > 1 And Len(args(1)) > 0 Then
    command = command & " -ExePath """ & args(1) & """"
End If

Set shell = CreateObject("WScript.Shell")

' 0 = hidden window. False = do not wait, so wscript exits immediately and the
' scheduled task's action completes while the watchdog keeps running.
shell.Run command, 0, False
