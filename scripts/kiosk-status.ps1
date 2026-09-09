<#
.SYNOPSIS
    Is the booth protected right now? One command, one answer.

.DESCRIPTION
    The watchdog runs with no window, which is what stops an operator closing it
    by accident - but it also means there is nothing on screen to tell you it is
    alive. This prints the state of every part that has to be working, and ends
    with PROTECTED or NOT PROTECTED so it can be checked at a glance before an
    event, or after a reboot, without trusting anyone's word for it.

    Read-only. It starts nothing, stops nothing and changes nothing.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File kiosk-status.ps1
#>
[CmdletBinding()]
param(
    [string] $TaskName = 'CatherinePhotoBoothKiosk'
)

$ErrorActionPreference = 'Continue'
$LogPath = Join-Path $env:LOCALAPPDATA 'CatherineKiosk\watchdog.log'
$problems = @()

function Line($label, $value, $ok) {
    $colour = if ($ok -eq $true) { 'Green' } elseif ($ok -eq $false) { 'Red' } else { 'Gray' }
    Write-Host ('  {0,-26} ' -f $label) -NoNewline
    Write-Host $value -ForegroundColor $colour
}

Write-Host ''
Write-Host '=== Catherine booth: is it protected? ===' -ForegroundColor Cyan
Write-Host ''

# 1. The scheduled task ----------------------------------------------------
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Line 'Scheduled task' 'NOT REGISTERED' $false
    $problems += "The task does not exist. Run install-kiosk-autostart.ps1."
} else {
    Line 'Scheduled task' $task.State ($task.State -ne 'Disabled')
    if ($task.State -eq 'Disabled') { $problems += "The task is disabled. Re-enable it." }
    $info = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($info) {
        Line 'Last run' $info.LastRunTime $null
        Line 'Last result' ('0x{0:X}' -f $info.LastTaskResult) ($info.LastTaskResult -eq 0)
    }
}

# 2. The watchdog process --------------------------------------------------
$wd = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*kiosk-watchdog*' })
if ($wd.Count -eq 0) {
    Line 'Watchdog process' 'NOT RUNNING' $false
    $problems += "No watchdog is running: nothing will restart the booth."
} else {
    Line 'Watchdog process' ("running (PID {0}, since {1:HH:mm:ss})" -f $wd[0].ProcessId, $wd[0].CreationDate) $true
    if ($wd.Count -gt 1) {
        Line 'WARNING' "$($wd.Count) watchdogs running - expected 1" $false
        $problems += "More than one watchdog is running; they will fight over relaunches."
    }
}

# 3. The booth itself ------------------------------------------------------
$booth = @(Get-Process -Name 'Catherine' -ErrorAction SilentlyContinue)
Line 'Booth (Catherine.exe)' $(if ($booth.Count) { "running (PID $($booth[0].Id))" } else { 'not running' }) $null

<# 4. Auto-logon - informational, NOT a fault.

   The task trigger is At-logon, and a logon is a logon whether somebody typed a
   password or Windows signed in by itself. So the booth starts either way. The
   only thing auto-logon buys is not needing a person at the keyboard after a
   power cut - worth having at an unattended venue, but not required. #>
$winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
$auto = (Get-ItemProperty -Path $winlogon -Name AutoAdminLogon -ErrorAction SilentlyContinue).AutoAdminLogon
if ($auto -eq '1') {
    $who = (Get-ItemProperty -Path $winlogon -Name DefaultUserName -ErrorAction SilentlyContinue).DefaultUserName
    Line 'Auto-logon' "on (as '$who') - starts with no one present" $true
} else {
    Line 'Auto-logon' 'off - starts once someone signs in' $null
}

# 5. What the watchdog last did -------------------------------------------
Write-Host ''
if (Test-Path $LogPath) {
    $tail = Get-Content $LogPath -Tail 6 -ErrorAction SilentlyContinue
    $last = Get-Item $LogPath
    $age = [int]((Get-Date) - $last.LastWriteTime).TotalMinutes
    Write-Host "  Watchdog log (last written $age min ago):" -ForegroundColor Gray
    $tail | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    # The heartbeat is every 5 minutes, so a log older than ~11 means it stopped.
    if ($age -gt 11 -and $wd.Count -gt 0) {
        $problems += "The watchdog process exists but has not written for $age min - it may be wedged."
    }
} else {
    Write-Host '  No watchdog log yet.' -ForegroundColor DarkGray
}

# Verdict ------------------------------------------------------------------
Write-Host ''
if ($problems.Count -eq 0) {
    Write-Host '  PROTECTED - the booth will come back within 10s of closing,' -ForegroundColor Green
    Write-Host '              and on its own after a restart or sleep.' -ForegroundColor Green
} else {
    Write-Host '  NOT PROTECTED' -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
}
Write-Host ''
