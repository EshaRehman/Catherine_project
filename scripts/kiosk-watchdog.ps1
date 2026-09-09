<#
.SYNOPSIS
    Keeps the Catherine photo booth running for the length of an event.

.DESCRIPTION
    Launches the booth, then watches it. If the process disappears for ANY
    reason - a crash, a GPU driver reset, someone killing it in Task Manager,
    or an operator choosing "Quit booth" - it is started again within a few
    seconds and comes back on the welcome screen. A booth that can be closed
    and left closed is a booth that is dark when the next guest walks up.

    There is no exit that keeps it closed, by design. To work on the machine,
    press Escape once in the booth: that drops it out of kiosk mode and
    minimises it WITHOUT closing it, so the desktop is yours and the watchdog
    has nothing to relaunch. To stop the booth altogether, disable the
    scheduled task or run uninstall-kiosk-autostart.ps1.

    Run by the scheduled task that install-kiosk-autostart.ps1 registers. Safe
    to run by hand for testing.

.PARAMETER ExePath
    Full path to Catherine.exe. Auto-detected if omitted.

.PARAMETER PollSeconds
    How often to check the process is alive. Default 5.

.PARAMETER RestartDelaySeconds
    Pause before relaunching after a crash, so a boot-looping app does not spin
    the CPU. Default 5. With the default -PollSeconds that puts a relaunch
    between five and ten seconds after the booth disappears.
#>
[CmdletBinding()]
param(
    [string] $ExePath,
    [int]    $PollSeconds = 5,
    [int]    $RestartDelaySeconds = 5,
    # Debugging only: keeps the console visible so you can watch the log live.
    [switch] $ShowConsole
)

$ErrorActionPreference = 'Stop'

<# Hide our own console window.

   The task already passes -WindowStyle Hidden, and it does not work: Task
   Scheduler allocates the console for powershell.exe before PowerShell can
   apply that flag, so the watchdog runs with a visible window. The booth and
   both backends then inherit it for their output, which makes it look like a
   normal terminal somebody can close - and closing it kills the watchdog and
   every process under it. That is exactly how the booth ended up unsupervised
   after a single restart.

   The console is hidden rather than removed: child processes still need
   somewhere to write, and a hidden window cannot be closed by an operator who
   thinks it is spare. #>
if (-not $ShowConsole) {
    try {
        Add-Type -Name Win -Namespace Native -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[DllImport("user32.dll")]   public static extern bool ShowWindow(System.IntPtr h, int c);
'@
        $consoleHandle = [Native.Win]::GetConsoleWindow()
        if ($consoleHandle -ne [IntPtr]::Zero) {
            [Native.Win]::ShowWindow($consoleHandle, 0) | Out-Null   # 0 = SW_HIDE
        }
    } catch {
        # Not fatal - a visible window is worse than no window, but far better
        # than no watchdog.
    }
}

$StopFlag = Join-Path $env:LOCALAPPDATA 'CatherineKiosk\stop.flag'
$LogPath  = Join-Path $env:LOCALAPPDATA 'CatherineKiosk\watchdog.log'

New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null

function Write-Log([string] $Message) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Output $line
    try {
        # Keep the log from growing without bound across a long-lived install.
        if ((Test-Path $LogPath) -and ((Get-Item $LogPath).Length -gt 2MB)) {
            Move-Item $LogPath "$LogPath.old" -Force
        }
        Add-Content -Path $LogPath -Value $line -Encoding utf8
    } catch { }
}

function Find-CatherineExe {
    if ($ExePath) {
        if (-not (Test-Path $ExePath)) { throw "ExePath not found: $ExePath" }
        return (Resolve-Path $ExePath).Path
    }

    # Squirrel (electron-forge maker-squirrel) installs per-user under
    # %LOCALAPPDATA%\Catherine: a launcher stub at the root and the real binary
    # inside a versioned app-x.y.z folder. Prefer the stub - it always points at
    # the newest version after an update.
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Catherine\Catherine.exe'),
        (Join-Path $env:LOCALAPPDATA 'catherine_project\Catherine.exe'),
        (Join-Path ${env:ProgramFiles} 'Catherine\Catherine.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }

    # Fall back to the newest versioned folder.
    $root = Join-Path $env:LOCALAPPDATA 'Catherine'
    if (Test-Path $root) {
        $versioned = Get-ChildItem -Path $root -Directory -Filter 'app-*' |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName 'Catherine.exe' } |
            Where-Object { Test-Path $_ } |
            Select-Object -First 1
        if ($versioned) { return $versioned }
    }

    throw "Could not find Catherine.exe. Install the app, or pass -ExePath."
}

$exe = Find-CatherineExe
Write-Log "Watchdog starting. Booth executable: $exe"

# A new session is a new intent to run, whatever the last shutdown decided.
if (Test-Path $StopFlag) {
    Remove-Item $StopFlag -Force -ErrorAction SilentlyContinue
    Write-Log "Cleared stale stop flag."
}

$processName = [System.IO.Path]::GetFileNameWithoutExtension($exe)

function Test-BoothRunning {
    $null -ne (Get-Process -Name $processName -ErrorAction SilentlyContinue)
}

function Start-Booth {
    Write-Log "Launching booth."
    try {
        Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) | Out-Null
    } catch {
        Write-Log "Launch failed: $($_.Exception.Message)"
    }
}

if (-not (Test-BoothRunning)) { Start-Booth }

$restarts = 0
$ticks = 0

<# The whole body is wrapped, because $ErrorActionPreference is 'Stop' up at the
   top of this file - deliberately, so a missing exe fails loudly at startup
   rather than looping uselessly. Inside the loop that setting is a liability:
   ANY non-terminating error becomes terminating, the script exits, the task
   goes to 'Ready', and the booth is left with nothing watching it. Observed
   exactly that - one successful restart, then silence.

   A watchdog that a transient error can kill is not a watchdog. Anything that
   goes wrong in here is logged and the loop carries on. #>
while ($true) {
    try {
        Start-Sleep -Seconds $PollSeconds
        $ticks++

        # A heartbeat every ~5 minutes. Cheap, and it is the difference between
        # "the watchdog is fine, nothing has closed" and "the watchdog died
        # hours ago" when reading this log after the fact.
        if (($ticks * $PollSeconds) % 300 -lt $PollSeconds) {
            Write-Log "Alive. Booth running: $(Test-BoothRunning). Restarts so far: $restarts."
        }

        if (-not (Test-BoothRunning)) {
            # Whatever took it down - a crash, Task Manager, the X, a five-second
            # hold on Escape - the booth is meant to be running, so it comes
            # back. The flag the app wrote on the way out is only a record of how
            # it went; it is cleared here so it cannot outlive the exit it
            # describes.
            $reason = 'no stop flag'
            if (Test-Path $StopFlag) {
                try { $reason = (Get-Content $StopFlag -Raw -ErrorAction Stop).Trim() } catch { }
                Remove-Item $StopFlag -Force -ErrorAction SilentlyContinue
            }

            $restarts++
            Write-Log "Booth is not running ($reason). Restart #$restarts in ${RestartDelaySeconds}s."
            Start-Sleep -Seconds $RestartDelaySeconds
            Start-Booth
        }
    } catch {
        Write-Log "Loop error, continuing anyway: $($_.Exception.Message)"
        Start-Sleep -Seconds $PollSeconds
    }
}
