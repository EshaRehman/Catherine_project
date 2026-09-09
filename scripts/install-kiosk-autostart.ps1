<#
.SYNOPSIS
    Makes this PC start the photo booth by itself and stay awake all event.

.DESCRIPTION
    Three things, all reversible with uninstall-kiosk-autostart.ps1:

      1. Registers a scheduled task that runs kiosk-watchdog.ps1 at logon,
         on resume from sleep, and on unlock. The watchdog starts the booth
         and relaunches it whenever it disappears - a crash, a kill, or an
         operator closing it - so a restart, a lid-open or a stray Alt+F4 all
         end with the booth back on the welcome screen without anyone
         touching the machine.

      2. Turns off the screensaver, monitor blanking, sleep and hibernate for
         this user, so nothing covers or dims the attract loop between guests.
         (The app also holds a display-sleep blocker while it runs; this covers
         the gap before it launches and the case where it is not running.)

      3. Optionally disables the lock screen timeout.

    Run as the user the booth runs as. Admin rights are only needed for the
    machine-wide power settings; without them the per-user settings still
    apply and the script says which parts it skipped.

.PARAMETER ExePath
    Full path to Catherine.exe. Auto-detected if omitted.

.PARAMETER TaskName
    Scheduled task name. Default 'CatherinePhotoBoothKiosk'.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install-kiosk-autostart.ps1
#>
[CmdletBinding()]
param(
    [string] $ExePath,
    [string] $TaskName = 'CatherinePhotoBoothKiosk'
)

$ErrorActionPreference = 'Stop'

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$watchdog    = Join-Path $scriptDir 'kiosk-watchdog.ps1'

if (-not (Test-Path $watchdog)) {
    throw "kiosk-watchdog.ps1 not found next to this script (looked in $scriptDir)."
}

function Test-Admin {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$isAdmin = Test-Admin

Write-Host ''
Write-Host '=== Catherine photo booth: kiosk autostart setup ===' -ForegroundColor Cyan
Write-Host ''

# ---------------------------------------------------------------
# 1. Scheduled task: run the watchdog at logon
# ---------------------------------------------------------------
Write-Host '[1/3] Registering the startup task...' -ForegroundColor Yellow

$argumentList = @(
    '-NoProfile'
    '-ExecutionPolicy', 'Bypass'
    '-WindowStyle', 'Hidden'
    '-File', "`"$watchdog`""
)
if ($ExePath) { $argumentList += @('-ExePath', "`"$ExePath`"") }

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument ($argumentList -join ' ')

# A short delay lets the shell, the display driver and the network finish
# coming up first; launching into a half-initialised session is how you get a
# booth with no camera or a window sized to the wrong resolution.
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$logonTrigger.Delay = 'PT20S'

# Waking from sleep is not a logon, so the trigger above never fires for it. If
# the watchdog died while the machine slept - or was never started because the
# PC came back from hibernation rather than a boot - nothing would bring the
# booth back. These two cover that: the System-log event Windows writes on
# resume, and the unlock that follows when the lock screen came up. Firing
# while the watchdog is already running is harmless; -MultipleInstances
# IgnoreNew below drops the duplicate.
$taskNamespace = 'Root/Microsoft/Windows/TaskScheduler'
$extraTriggers = @()

try {
    $resumeTrigger = New-CimInstance -ClientOnly `
        -CimClass (Get-CimClass -ClassName MSFT_TaskEventTrigger -Namespace $taskNamespace)
    $resumeTrigger.Enabled = $true
    $resumeTrigger.Delay = 'PT15S'
    $resumeTrigger.Subscription = "<QueryList><Query Id='0' Path='System'><Select Path='System'>*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]</Select></Query></QueryList>"
    $extraTriggers += $resumeTrigger

    $unlockTrigger = New-CimInstance -ClientOnly `
        -CimClass (Get-CimClass -ClassName MSFT_TaskSessionStateChangeTrigger -Namespace $taskNamespace)
    $unlockTrigger.Enabled = $true
    $unlockTrigger.Delay = 'PT10S'
    $unlockTrigger.StateChange = 8      # SessionUnlock
    $unlockTrigger.UserId = "$env:USERDOMAIN\$env:USERNAME"
    $extraTriggers += $unlockTrigger
} catch {
    Write-Host "      Could not add the wake/unlock triggers: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host '      The logon trigger still works; the booth just will not be' -ForegroundColor Yellow
    Write-Host '      re-checked after a resume from sleep.' -ForegroundColor Yellow
}

$trigger = @($logonTrigger) + $extraTriggers

<# Belt and braces for the watchdog itself. The triggers above all fire on an
   event - logon, resume, unlock - so if the watchdog process dies mid-event
   with nobody touching the machine, nothing brings it back and the booth is
   unsupervised for the rest of the day. Observed in the field: the task sat at
   'Ready' after a single restart.

   A repeating logon trigger fixes that. With -MultipleInstances IgnoreNew
   below, a repetition while the watchdog is already running is discarded, so
   this costs nothing in the normal case and restarts it within five minutes in
   the bad one. RepetitionDuration has to be longer than any event will run;
   [TimeSpan]::MaxValue is how the scheduler spells "indefinitely". #>
try {
    $logonTrigger.RepetitionInterval = New-TimeSpan -Minutes 5
    $logonTrigger.RepetitionDuration = [TimeSpan]::MaxValue
} catch {
    Write-Host "      Could not set the 5-minute re-check: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host '      The watchdog still starts at logon; it just will not be' -ForegroundColor Yellow
    Write-Host '      restarted automatically if its own process is killed.' -ForegroundColor Yellow
}

# ExecutionTimeLimit 0 = never kill it. The default is three days, which would
# silently end the watchdog on a booth left installed between events.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop } catch { }

Register-ScheduledTask `
    -TaskName    $TaskName `
    -Action      $action `
    -Trigger     $trigger `
    -Settings    $settings `
    -Principal   $principal `
    -Description 'Starts the Catherine photo booth at logon, on resume from sleep and on unlock, and relaunches it whenever it stops.' | Out-Null

Write-Host "      Registered scheduled task '$TaskName'." -ForegroundColor Green
Write-Host "      Triggers: logon$(if ($extraTriggers.Count) { ', resume from sleep, unlock' })." -ForegroundColor Green

# ---------------------------------------------------------------
# 2. Screensaver off (per-user, no admin needed)
# ---------------------------------------------------------------
Write-Host '[2/3] Disabling the screensaver for this user...' -ForegroundColor Yellow

$desktopKey = 'HKCU:\Control Panel\Desktop'
Set-ItemProperty -Path $desktopKey -Name 'ScreenSaveActive'   -Value '0' -Type String
Set-ItemProperty -Path $desktopKey -Name 'ScreenSaveTimeOut'  -Value '0' -Type String
Set-ItemProperty -Path $desktopKey -Name 'ScreenSaverIsSecure' -Value '0' -Type String
try { Remove-ItemProperty -Path $desktopKey -Name 'SCRNSAVE.EXE' -ErrorAction Stop } catch { }

Write-Host '      Screensaver disabled.' -ForegroundColor Green

# ---------------------------------------------------------------
# 3. Never sleep, never blank the display
# ---------------------------------------------------------------
Write-Host '[3/3] Setting the power plan to never sleep...' -ForegroundColor Yellow

# powercfg /change is per-machine and needs elevation on most builds. It is
# applied to both AC and DC so a booth on a laptop behaves the same unplugged.
$powerOk = $true
foreach ($pair in @(
    @('monitor-timeout-ac',   '0'),
    @('monitor-timeout-dc',   '0'),
    @('standby-timeout-ac',   '0'),
    @('standby-timeout-dc',   '0'),
    @('hibernate-timeout-ac', '0'),
    @('hibernate-timeout-dc', '0'),
    @('disk-timeout-ac',      '0')
)) {
    & powercfg.exe /change $pair[0] $pair[1] 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $powerOk = $false }
}

if ($powerOk) {
    Write-Host '      Display and sleep timeouts set to Never.' -ForegroundColor Green
} elseif (-not $isAdmin) {
    Write-Host '      Skipped: needs an elevated PowerShell.' -ForegroundColor DarkYellow
    Write-Host '      Re-run this script as Administrator, or set' -ForegroundColor DarkYellow
    Write-Host '      Settings > System > Power > Screen and sleep to Never by hand.' -ForegroundColor DarkYellow
} else {
    Write-Host '      Some power settings could not be applied.' -ForegroundColor DarkYellow
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Cyan
Write-Host ''
Write-Host 'What happens now:' -ForegroundColor White
Write-Host '  - On every logon the booth starts full-screen by itself, 20s in.'
Write-Host '  - If it ever closes unexpectedly it is relaunched within ~10s'
Write-Host '    and returns to the welcome screen.'
Write-Host '  - Quitting on purpose (Esc, then Quit booth) stays quit.'
Write-Host ''
Write-Host 'Two things this script cannot do for you:' -ForegroundColor White
Write-Host '  - Auto-logon. If the PC asks for a password at boot, set up an'
Write-Host '    automatic logon for the booth account, or the task cannot run.'
Write-Host '    Run:  netplwiz   and untick "Users must enter a user name and'
Write-Host '    password to use this computer".'
Write-Host '  - Windows Update restarts. Set Settings > Windows Update >'
Write-Host '    Active hours to cover the event, or pause updates for the week.'
Write-Host ''
Write-Host "Watchdog log: $env:LOCALAPPDATA\CatherineKiosk\watchdog.log"
Write-Host ''
Write-Host 'To test without rebooting:' -ForegroundColor White
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ''
