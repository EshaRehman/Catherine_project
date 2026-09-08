<#
.SYNOPSIS
    Undoes install-kiosk-autostart.ps1.

.DESCRIPTION
    Removes the logon task, stops the running watchdog, and puts the screensaver
    and power timeouts back to ordinary desktop defaults (screensaver off is
    left alone - turning one back on is a preference, not a repair; the sleep
    timeouts are restored to Windows' usual 10/30 minutes).

    Use this when handing the PC back to normal use, or before uninstalling the
    booth application.
#>
[CmdletBinding()]
param(
    [string] $TaskName = 'CatherinePhotoBoothKiosk',
    [switch] $KeepPowerSettings
)

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '=== Removing Catherine photo booth kiosk autostart ===' -ForegroundColor Cyan
Write-Host ''

# 1. Scheduled task
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
} catch {
    Write-Host "No scheduled task named '$TaskName' was registered." -ForegroundColor DarkYellow
}

# 2. Any watchdog still looping in this session. Matching on the command line
#    keeps this from killing unrelated PowerShell windows the operator has open.
$killed = 0
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*kiosk-watchdog.ps1*' } |
    ForEach-Object {
        try {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
            $killed++
        } catch { }
    }
if ($killed -gt 0) {
    Write-Host "Stopped $killed running watchdog process(es)." -ForegroundColor Green
}

# 3. The app's per-user login item, if the packaged build registered one.
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
foreach ($name in @('Catherine', 'catherine_project')) {
    try {
        if (Get-ItemProperty -Path $runKey -Name $name -ErrorAction Stop) {
            Remove-ItemProperty -Path $runKey -Name $name -Force
            Write-Host "Removed '$name' from the per-user Run key." -ForegroundColor Green
        }
    } catch { }
}

# 4. Power timeouts back to Windows defaults
if (-not $KeepPowerSettings) {
    foreach ($pair in @(
        @('monitor-timeout-ac',   '10'),
        @('monitor-timeout-dc',   '5'),
        @('standby-timeout-ac',   '30'),
        @('standby-timeout-dc',   '15'),
        @('hibernate-timeout-ac', '0'),
        @('hibernate-timeout-dc', '0'),
        @('disk-timeout-ac',      '20')
    )) {
        & powercfg.exe /change $pair[0] $pair[1] 2>&1 | Out-Null
    }
    Write-Host 'Restored default sleep and display timeouts.' -ForegroundColor Green
} else {
    Write-Host 'Left power settings as they are (-KeepPowerSettings).' -ForegroundColor DarkYellow
}

Write-Host ''
Write-Host 'Done. The booth will no longer start by itself.' -ForegroundColor Cyan
Write-Host 'The screensaver is still disabled - re-enable it in' -ForegroundColor DarkGray
Write-Host 'Settings > Personalisation > Lock screen if you want it back.' -ForegroundColor DarkGray
Write-Host ''
