# ================================================================
#   CATHERINE PHOTO BOOTH - NEW PC FULL SETUP SCRIPT
#   Right-click this file -> Run with PowerShell
#   OR open PowerShell as Admin and run:
#       powershell -ExecutionPolicy Bypass -File "2_SETUP_NEW_PC.ps1"
# ================================================================

#Requires -Version 5.1

# -- Auto-elevate to Administrator --------------------------------
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force

# ================================================================
#   CONFIGURATION  -- Edit these values if needed
# ================================================================

$INSTALL_DRIVE     = "C"
$BASE_DIR          = "$($INSTALL_DRIVE):\PhotoBoothApp"          # ← single parent folder for BOTH repos
$APP_DIR           = "$BASE_DIR\APP-Electron"                    # PhotoBooth backend + ComfyUI
$ELECTRON_DIR      = "$BASE_DIR\Catherine_project"               # Electron frontend

$ELECTRON_REPO     = "https://github.com/EshaRehman/Catherine_project"
$BACKEND_REPO      = "https://github.com/SheikhAnas999/PhotoBooth.git"
# ComfyUI is already inside the PhotoBooth repo -- no separate clone needed

# ── MongoDB Cloud Backup ─────────────────────────────────────────
# GitHub Release: SheikhAnas999/PhotoBooth → tag: mngdb
# Asset        : Catherine-MongoDB-Backup.zip
#
$MONGO_BACKUP_URL  = "https://github.com/SheikhAnas999/PhotoBooth/releases/download/mngdbv2/Catherine-MongoDB-Backup.zip"

$PYTHON_URL        = "https://www.python.org/ftp/python/3.10.8/python-3.10.8-amd64.exe"

$MONGODB_VERSION   = "8.0.4"
$MONGODB_URL       = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.4-signed.msi"
$MONGODB_TOOLS_URL = "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-windows-x86_64-100.10.0.zip"

# ── Set to $true to skip model downloads (all other steps still run) ──
$SKIP_MODELS       = $false

# -- AI Models -- direct download URLs ---------------------------
$MODELS = @(
    @{
        Name = "Qwen Image Edit Diffusion Model (20 GB)"
        URL  = "https://huggingface.co/drbaph/Qwen-Image-Edit-2511-FP8/resolve/main/qwen_image_edit_2511_fp8_e4m3fn.safetensors"
        DEST = "$APP_DIR\ComfyUI\models\diffusion_models\qwen_image_edit_2511_fp8_e4m3fn.safetensors"
    },
    @{
        Name = "Qwen 2.5 VL Text Encoder (8.8 GB)"
        URL  = "https://huggingface.co/f5aiteam/CLIP/resolve/main/qwen_2.5_vl_7b_fp8_scaled.safetensors"
        DEST = "$APP_DIR\ComfyUI\models\text_encoders\qwen_2.5_vl_7b_fp8_scaled.safetensors"
    },
    @{
        Name = "Qwen Image VAE (243 MB)"
        URL  = "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors"
        DEST = "$APP_DIR\ComfyUI\models\vae\qwen_image_vae.safetensors"
    },
    @{
        Name = "Qwen Image Lightning LoRA (1.6 GB)"
        URL  = "https://huggingface.co/lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Lightning-4steps-V1.0.safetensors"
        DEST = "$APP_DIR\ComfyUI\models\loras\Qwen-Image-Lightning-4steps-V1.0.safetensors"
    },
    @{
        Name = "YOLO11x Object Detection Model (109 MB)"
        URL  = "https://huggingface.co/Ultralytics/YOLO11/resolve/a01aaa06caeff788b052e193acb76b3f21571b3a/yolo11x.pt"
        DEST = "$APP_DIR\Backend(Fast-API)\yolo11x.pt"
    }
)

# ================================================================
#   HELPER FUNCTIONS
# ================================================================

function Write-Step { param($n, $text)
    Write-Host ""
    Write-Host "[$n] $text" -ForegroundColor Cyan
    Write-Host "-------------------------------------------------------" -ForegroundColor DarkGray
}

function Write-OK   { param($text) Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Warn { param($text) Write-Host "  [!]  $text" -ForegroundColor Yellow }
function Write-Err  { param($text) Write-Host "  [X]  $text" -ForegroundColor Red }
function Write-Info { param($text) Write-Host "       $text" -ForegroundColor Gray }

function Test-CommandExists { param($cmd)
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Download-File { param($url, $dest, $name)
    Write-Info "Downloading $name ..."
    Write-Info "  URL : $url"
    Write-Info "  To  : $dest"
    try {
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($url, $dest)
        Write-OK "Downloaded: $name"
    } catch {
        try {
            Start-BitsTransfer -Source $url -Destination $dest -DisplayName $name
            Write-OK "Downloaded: $name"
        } catch {
            Write-Err "Failed to download $name : $_"
            throw
        }
    }
}

function Ensure-Dir { param($path)
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")
}

# ================================================================
#   BANNER
# ================================================================

Clear-Host
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   CATHERINE PHOTO BOOTH -- NEW PC SETUP               " -ForegroundColor Cyan
Write-Host "   Installs everything automatically                    " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Install root     : $BASE_DIR"
Write-Host "  Backend + ComfyUI : $APP_DIR"
Write-Host "  Electron app      : $ELECTRON_DIR"
Write-Host ""
Write-Host "This will install:"
Write-Host "  * Python 3.10.8"
Write-Host "  * Node.js LTS + npm"
Write-Host "  * Git"
Write-Host "  * MongoDB 8.0 (as Windows service)"
Write-Host "  * FastAPI backend + ComfyUI (from GitHub)"
Write-Host "  * Electron app (from GitHub)"
Write-Host "  * All Python packages (PyTorch CUDA 12.4 etc.)"
Write-Host "  * AI Models (~31 GB)"
Write-Host ""
Write-Host "[!] REQUIREMENTS:" -ForegroundColor Yellow
Write-Host "    * NVIDIA GPU with CUDA 12.4 drivers installed"
Write-Host "    * ~60 GB free space on $INSTALL_DRIVE drive"
Write-Host "    * Stable internet connection"
Write-Host ""

$proceed = Read-Host "Ready to begin? [Y/n]"
if ($proceed -eq "n" -or $proceed -eq "N") { exit }

# ================================================================
#   STEP 1 -- Check Free Disk Space
# ================================================================

Write-Step "1/9" "Checking disk space"
$disk   = Get-PSDrive $INSTALL_DRIVE
$freeGB = [math]::Round($disk.Free / 1GB, 1)
Write-Info "Free space on ${INSTALL_DRIVE}: drive: ${freeGB} GB"
if ($freeGB -lt 55) {
    Write-Warn "Less than 55 GB free. You may run out of space."
    $r = Read-Host "Continue anyway? [Y/n]"
    if ($r -eq "n" -or $r -eq "N") { exit }
} else {
    Write-OK "Disk space OK (${freeGB} GB free)"
}

# ================================================================
#   STEP 2 -- Install Python 3.10.8
# ================================================================

Write-Step "2/9" "Installing Python 3.10.8"

$pythonExe       = "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe"
$pythonInstalled = (Test-CommandExists "python") -or (Test-Path $pythonExe)

if ($pythonInstalled) {
    $v = (python --version 2>&1)
    Write-OK "Python already installed: $v"
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pyCmd) { $pythonExe = $pyCmd.Source }
} else {
    $pyInstaller = "$env:TEMP\python-installer.exe"
    Download-File $PYTHON_URL $pyInstaller "Python 3.10.8"

    Write-Info "Installing Python silently ..."
    $pyArgs = "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0 Include_pip=1"
    Start-Process $pyInstaller -ArgumentList $pyArgs -Wait -NoNewWindow

    Refresh-Path

    if (Test-Path $pythonExe) {
        Write-OK "Python 3.10.8 installed"
    } else {
        Write-Err "Python install failed. Install manually from python.org"
        Read-Host "Press Enter to exit"; exit 1
    }
}

# ================================================================
#   STEP 3 -- Install Node.js LTS
# ================================================================

Write-Step "3/9" "Installing Node.js LTS"

if (Test-CommandExists "node") {
    Write-OK "Node.js already installed: $(node --version)"
} else {
    if (Test-CommandExists "winget") {
        Write-Info "Installing Node.js via winget ..."
        winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
    }
    if (-not (Test-CommandExists "node")) {
        $nodeMsi = "$env:TEMP\node-installer.msi"
        Download-File "https://nodejs.org/dist/v22.13.1/node-v22.13.1-x64.msi" $nodeMsi "Node.js LTS"
        Start-Process msiexec -ArgumentList "/i `"$nodeMsi`" /quiet /norestart" -Wait -NoNewWindow
        Refresh-Path
    }
    if (Test-CommandExists "node") {
        Write-OK "Node.js installed: $(node --version)"
    } else {
        Write-Warn "Node.js may need a restart to appear. Continuing ..."
    }
}

# ================================================================
#   STEP 4 -- Install Git
# ================================================================

Write-Step "4/9" "Installing Git"

if (Test-CommandExists "git") {
    Write-OK "Git already installed: $(git --version)"
} else {
    if (Test-CommandExists "winget") {
        Write-Info "Installing Git via winget ..."
        winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements
        Refresh-Path
    }
    if (-not (Test-CommandExists "git")) {
        $gitExe = "$env:TEMP\git-installer.exe"
        Download-File "https://github.com/git-for-windows/git/releases/download/v2.48.1.windows.1/Git-2.48.1-64-bit.exe" $gitExe "Git"
        Start-Process $gitExe -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL" -Wait -NoNewWindow
        Refresh-Path
    }
    if (Test-CommandExists "git") {
        Write-OK "Git installed: $(git --version)"
    } else {
        Write-Err "Git install failed. Install from git-scm.com"
        Read-Host "Press Enter to exit"; exit 1
    }
}

# ================================================================
#   STEP 5 -- Install MongoDB 8.0 as Windows Service
# ================================================================

Write-Step "5/9" "Installing MongoDB"

$mongodPath    = "C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe"
$mongodPathAlt = "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe"
$mongoInstalled = (Test-Path $mongodPath) -or (Test-Path $mongodPathAlt)

if ($mongoInstalled) {
    Write-OK "MongoDB already installed"
    $svc = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne "Running") {
        Start-Service -Name "MongoDB" -ErrorAction SilentlyContinue
        Write-OK "MongoDB service started"
    } elseif ($svc) {
        Write-OK "MongoDB service already running"
    }
} else {
    $mongoMsi = "$env:TEMP\mongodb-installer.msi"
    Download-File $MONGODB_URL $mongoMsi "MongoDB $MONGODB_VERSION"

    Ensure-Dir "C:\Program Files\MongoDB\Server\8.0\data"
    Ensure-Dir "C:\Program Files\MongoDB\Server\8.0\log"

    Write-Info "Installing MongoDB silently ..."
    $msiArgs = "/i `"$mongoMsi`" /quiet /norestart INSTALLLOCATION=`"C:\Program Files\MongoDB\Server\8.0\`" ADDLOCAL=`"ServerNoService`""
    Start-Process msiexec -ArgumentList $msiArgs -Wait -NoNewWindow

    $mongoCfg = "C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg"
    $cfgContent = @"
storage:
  dbPath: C:\Program Files\MongoDB\Server\8.0\data
systemLog:
  destination: file
  logAppend: true
  path: C:\Program Files\MongoDB\Server\8.0\log\mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
"@
    Set-Content $mongoCfg -Value $cfgContent -Encoding UTF8

    $mongodExe = "C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe"
    if (Test-Path $mongodExe) {
        & $mongodExe --config $mongoCfg --install
        Start-Service MongoDB -ErrorAction SilentlyContinue
        Write-OK "MongoDB installed and running as Windows service"
    } else {
        Write-Warn "MongoDB .exe not found after install. Check: $env:TEMP\mongodb-install.log"
    }
}

# Install MongoDB Database Tools (mongodump / mongorestore)
$mongodumpExe = "C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe"
if (-not (Test-Path $mongodumpExe)) {
    Write-Info "Installing MongoDB Database Tools ..."
    $toolsZip = "$env:TEMP\mongodb-tools.zip"
    $toolsDir = "$env:TEMP\mongodb-tools"
    Download-File $MONGODB_TOOLS_URL $toolsZip "MongoDB Database Tools"
    Expand-Archive -Path $toolsZip -DestinationPath $toolsDir -Force
    $toolsBin = Get-ChildItem $toolsDir -Recurse -Directory |
                Where-Object { $_.Name -eq "bin" } |
                Select-Object -First 1
    if ($toolsBin) {
        $destTools = "C:\Program Files\MongoDB\Tools\100\bin"
        Ensure-Dir $destTools
        Copy-Item "$($toolsBin.FullName)\*" $destTools -Force
        Write-OK "MongoDB Database Tools installed"
    }
}

# ================================================================
#   STEP 6 -- Clone Repositories from GitHub
# ================================================================

Write-Step "6/9" "Cloning repositories from GitHub"

# Make sure the single common parent folder exists
Ensure-Dir $BASE_DIR
Write-OK "Common parent folder ready: $BASE_DIR"

# 6a -- Electron app
if (Test-Path "$ELECTRON_DIR\.git") {
    Write-OK "Electron repo already cloned -- pulling latest ..."
    git -C $ELECTRON_DIR pull --quiet
} else {
    Write-Info "Cloning Electron app into $ELECTRON_DIR ..."
    git clone $ELECTRON_REPO $ELECTRON_DIR
    Write-OK "Electron app cloned to: $ELECTRON_DIR"
}

# 6b -- PhotoBooth repo (contains Backend + ComfyUI)
if (Test-Path "$APP_DIR\.git") {
    Write-OK "PhotoBooth repo already cloned -- pulling latest ..."
    git -C $APP_DIR pull --quiet
} else {
    Write-Info "Cloning PhotoBooth repo (Backend + ComfyUI) into $APP_DIR ..."
    git clone $BACKEND_REPO $APP_DIR
    Write-OK "PhotoBooth cloned to: $APP_DIR"
}

# Create model folders (in case they are gitignored)
Ensure-Dir "$APP_DIR\Images"
Ensure-Dir "$APP_DIR\ComfyUI\models\diffusion_models"
Ensure-Dir "$APP_DIR\ComfyUI\models\text_encoders"
Ensure-Dir "$APP_DIR\ComfyUI\models\vae"
Ensure-Dir "$APP_DIR\ComfyUI\models\loras"
Ensure-Dir "$APP_DIR\ComfyUI\models\LLM"
Ensure-Dir "$APP_DIR\ComfyUI\models\controlnet"
Ensure-Dir "$APP_DIR\ComfyUI\output"
Write-OK "Folder structure ready"

# ================================================================
#   STEP 7 -- Python venvs + Install All Packages
# ================================================================

Write-Step "7/9" "Setting up Python environments (10-30 min)"
Write-Host "       PyTorch CUDA 12.4 is ~2.5 GB -- please wait ..." -ForegroundColor Yellow

# -- Helper: find Python 3.10 exe --
function Find-Python310 {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "C:\Python310\python.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pyCmd) { return $pyCmd.Source }
    return $null
}

# ---- 7a: Backend venv ----
Write-Host ""
Write-Host "  [7a] Backend venv -- $APP_DIR\venv" -ForegroundColor Cyan

$venvDir  = "$APP_DIR\venv"
$venvPy   = "$venvDir\Scripts\python.exe"
$venvPip  = "$venvDir\Scripts\pip.exe"
$reqFile  = "$APP_DIR\requirements.txt"

if (-not (Test-Path $venvPy)) {
    Write-Info "Creating Backend virtual environment ..."
    $py310 = Find-Python310
    if (-not $py310) { Write-Err "Python 3.10 not found."; Read-Host "Press Enter to exit"; exit 1 }
    & $py310 -m venv $venvDir
    Write-OK "Backend venv created: $venvDir"
} else {
    Write-OK "Backend venv already exists"
}

Write-Info "Upgrading pip (backend) ..."
& $venvPip install --upgrade pip --quiet

if (Test-Path $reqFile) {
    Write-Info "Installing backend packages from $reqFile ..."
    & $venvPip install -r $reqFile
    if ($LASTEXITCODE -eq 0) { Write-OK "Backend packages installed" }
    else { Write-Warn "Some backend packages may have failed -- check output above" }
} else {
    Write-Warn "Backend requirements.txt not found at: $reqFile"
}

# ---- 7b: ComfyUI venv ----
Write-Host ""
Write-Host "  [7b] ComfyUI venv -- $APP_DIR\ComfyUI\venv" -ForegroundColor Cyan

$comfyVenvDir  = "$APP_DIR\ComfyUI\venv"
$comfyVenvPy   = "$comfyVenvDir\Scripts\python.exe"
$comfyVenvPip  = "$comfyVenvDir\Scripts\pip.exe"
$comfyReqFile  = "$APP_DIR\ComfyUI\requirements.txt"

if (-not (Test-Path $comfyVenvPy)) {
    Write-Info "Creating ComfyUI virtual environment ..."
    $py310 = Find-Python310
    if (-not $py310) { Write-Err "Python 3.10 not found."; Read-Host "Press Enter to exit"; exit 1 }
    & $py310 -m venv $comfyVenvDir
    Write-OK "ComfyUI venv created: $comfyVenvDir"
} else {
    Write-OK "ComfyUI venv already exists"
}

Write-Info "Upgrading pip (ComfyUI) ..."
& $comfyVenvPip install --upgrade pip --quiet

if (Test-Path $comfyReqFile) {
    Write-Info "Installing ComfyUI packages from $comfyReqFile ..."
    & $comfyVenvPip install -r $comfyReqFile
    if ($LASTEXITCODE -eq 0) { Write-OK "ComfyUI packages installed" }
    else { Write-Warn "Some ComfyUI packages may have failed -- check output above" }
} else {
    Write-Warn "ComfyUI requirements.txt not found at: $comfyReqFile"
}

# Electron npm packages
Write-Info "Running npm install for Electron app ..."
Push-Location $ELECTRON_DIR
npm install
Pop-Location
Write-OK "npm packages installed"

# ================================================================
#   STEP 8 -- Download AI Models
# ================================================================

if ($SKIP_MODELS) {
    Write-Step "8/9" "Downloading AI Models  [SKIPPED -- set `$SKIP_MODELS = `$false to enable]"
    Write-Warn "Model downloads skipped. Set `$SKIP_MODELS = `$false at the top of this script to download them."
} else {

Write-Step "8/9" "Downloading AI Models"
Write-Host "       Total: ~31 GB -- may take 1-3 hours" -ForegroundColor Yellow
Write-Host ""

# Try to get aria2 for fast parallel downloads
$aria2 = $null
if (-not (Test-CommandExists "aria2c")) {
    Write-Info "Getting aria2 for faster downloads ..."
    try {
        $aria2Zip = "$env:TEMP\aria2.zip"
        $aria2Dir = "$env:TEMP\aria2"
        Download-File "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip" $aria2Zip "aria2"
        Expand-Archive -Path $aria2Zip -DestinationPath $aria2Dir -Force
        $aria2Exe = Get-ChildItem $aria2Dir -Recurse -Filter "aria2c.exe" | Select-Object -First 1
        if ($aria2Exe) {
            $aria2 = $aria2Exe.FullName
            Write-OK "aria2 ready (fast parallel downloads enabled)"
        }
    } catch {
        Write-Warn "aria2 not available -- using BITS transfer instead"
    }
} else {
    $aria2Cmd = Get-Command aria2c
    $aria2    = $aria2Cmd.Source
    Write-OK "aria2 available"
}

$totalModels = $MODELS.Count
$i = 0

foreach ($model in $MODELS) {
    $i++
    Write-Host ""
    Write-Host "  [$i/$totalModels] $($model.Name)" -ForegroundColor Cyan

    if (Test-Path $model.DEST) {
        $sizeMB = [math]::Round((Get-Item $model.DEST).Length / 1MB, 0)
        Write-OK "Already downloaded ($sizeMB MB) - skipping"
        continue
    }

    Ensure-Dir (Split-Path $model.DEST)
    Write-Info "URL : $($model.URL)"
    Write-Info "To  : $($model.DEST)"

    $success = $false

    # Method 1 -- aria2 (fastest: 16 parallel connections)
    if ($aria2) {
        try {
            $destDir  = Split-Path $model.DEST
            $destFile = Split-Path $model.DEST -Leaf
            & $aria2 $model.URL `
                --dir="$destDir" `
                --out="$destFile" `
                --max-connection-per-server=16 `
                --split=16 `
                --min-split-size=10M `
                --continue=true `
                --console-log-level=warn `
                --summary-interval=30
            if ($LASTEXITCODE -eq 0) { $success = $true }
        } catch { }
    }

    # Method 2 -- BITS transfer (resumes on disconnect)
    if (-not $success) {
        try {
            Write-Info "Using BITS transfer ..."
            Start-BitsTransfer -Source $model.URL -Destination $model.DEST -DisplayName $model.Name
            $success = $true
        } catch {
            Write-Warn "BITS failed: $_"
        }
    }

    # Method 3 -- Invoke-WebRequest (last resort)
    if (-not $success) {
        try {
            Write-Info "Using Invoke-WebRequest ..."
            Invoke-WebRequest -Uri $model.URL -OutFile $model.DEST -UseBasicParsing
            $success = $true
        } catch {
            Write-Err "All download methods failed for: $($model.Name)"
            Write-Warn "Download manually from: $($model.URL)"
            Write-Warn "Save to               : $($model.DEST)"
        }
    }

    if ($success -and (Test-Path $model.DEST)) {
        $sizeMB = [math]::Round((Get-Item $model.DEST).Length / 1MB, 0)
        Write-OK "Done: $($model.Name) ($sizeMB MB)"
    }
}

} # end if (-not $SKIP_MODELS)

# ================================================================
#   STEP 9 -- Restore MongoDB Backup
# ================================================================

Write-Step "9/9" "Restoring MongoDB Data"

$mongorestore = "C:\Program Files\MongoDB\Tools\100\bin\mongorestore.exe"
if (-not (Test-Path $mongorestore)) { $mongorestore = "mongorestore" }

function Restore-FromFolder { param($backupPath)
    $dbBackup = "$backupPath\PhotoBooth"
    if (-not (Test-Path $dbBackup)) {
        $found = Get-ChildItem $backupPath -Recurse -Directory -Filter "PhotoBooth" | Select-Object -First 1
        if ($found) { $dbBackup = $found.FullName }
    }
    if ($dbBackup -and (Test-Path $dbBackup)) {
        Write-Info "Restoring PhotoBooth database ..."
        & $mongorestore --uri="mongodb://localhost:27017" --db=PhotoBooth $dbBackup --gzip --drop
        Write-OK "MongoDB PhotoBooth database restored!"
        return $true
    }
    Write-Warn "Could not find PhotoBooth folder inside: $backupPath"
    return $false
}

# ── Try cloud restore first ───────────────────────────────────────
$cloudRestored = $false

if ($MONGO_BACKUP_URL -ne "") {
    Write-Host "  Downloading MongoDB backup from GitHub Releases ..." -ForegroundColor Cyan
    Write-Info "  URL: $MONGO_BACKUP_URL"

    $backupZip   = "$env:TEMP\Catherine-MongoDB-Backup.zip"
    $backupDir   = "$env:TEMP\Catherine-MongoDB-Restore"

    try {
        # Download
        Write-Info "Downloading from GitHub Releases ..."
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($MONGO_BACKUP_URL, $backupZip)
        Write-OK "Backup downloaded: $backupZip"

        # Extract the zip
        Ensure-Dir $backupDir
        Write-Info "Extracting backup ..."
        Expand-Archive -Path $backupZip -DestinationPath $backupDir -Force
        Write-OK "Backup extracted to: $backupDir"

        $cloudRestored = Restore-FromFolder $backupDir
    } catch {
        Write-Warn "Cloud download/restore failed: $_"
        Write-Warn "Falling back to manual restore..."
    }
}

# ── Fall back to manual restore if cloud didn't work ─────────────
if (-not $cloudRestored) {
    Write-Host ""
    Write-Host "  No cloud backup URL configured (or download failed)." -ForegroundColor Yellow
    Write-Host "  Do you have a local MongoDB backup folder?" -ForegroundColor Yellow
    Write-Host "  (Made by 1_BACKUP_OLD_PC.bat -- folder: Catherine-MongoDB-Backup)" -ForegroundColor Gray
    $hasBackup = Read-Host "  Restore from local folder? [Y/n]"

    if ($hasBackup -ne "n" -and $hasBackup -ne "N") {
        $backupPath = (Read-Host "  Full path to backup folder (e.g. E:\Catherine-MongoDB-Backup)").Trim()

        if (-not (Test-Path $backupPath)) {
            Write-Err "Path not found: $backupPath"
            Write-Warn "Restore later with:"
            Write-Warn "  mongorestore --uri=mongodb://localhost:27017 --db=PhotoBooth <path>\PhotoBooth --gzip"
        } else {
            Restore-FromFolder $backupPath | Out-Null
        }
    } else {
        Write-Info "Skipped -- starting with empty database"
        Write-Info "To enable auto-restore on next PC, set `$MONGO_BACKUP_URL at the top of this script."
    }
}

# ================================================================
#   CREATE .env FILE FOR BACKEND
# ================================================================

$envFile = "$APP_DIR\Backend(Fast-API)\.env"
if (-not (Test-Path $envFile)) {
    $envContent = @"
mongodb_uri=mongodb://localhost:27017
mongodb_db_name=PhotoBooth

CLOUDINARY_CLOUD_NAME=dp8tqvcym
CLOUDINARY_API_KEY=378454957966563
CLOUDINARY_API_SECRET=TJtFAk4DC0UBmC31hJuypiOtmw0
"@
    Set-Content $envFile -Value $envContent -Encoding UTF8
    Write-OK "Created backend .env file (MongoDB + Cloudinary)"
} else {
    Write-OK "Backend .env already exists -- skipping"
}

# ================================================================
#   DONE
# ================================================================

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "   SETUP COMPLETE!                                      " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Installed to: $BASE_DIR"
Write-Host "  Backend + ComfyUI : $APP_DIR"
Write-Host "  Electron app      : $ELECTRON_DIR"
Write-Host ""
Write-Host "To run the app:"
Write-Host "  cd $ELECTRON_DIR"
Write-Host "  npm start"
Write-Host ""

$buildNow = Read-Host "Build the Electron installer (.exe) now? [Y/n]"
if ($buildNow -ne "n" -and $buildNow -ne "N") {
    Write-Info "Building installer ..."
    Push-Location $ELECTRON_DIR
    npm run make
    $outDir = "$ELECTRON_DIR\out\make\squirrel.windows\x64"
    if (Test-Path $outDir) {
        Write-OK "Installer ready at: $outDir"
        explorer $outDir
    }
    Pop-Location
}

Write-Host ""
Read-Host "Press Enter to exit"
