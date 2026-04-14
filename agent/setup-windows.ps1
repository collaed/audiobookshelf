# Audiobookshelf Agent — Windows Setup
# Run in PowerShell as Administrator

$AgentDir = "$env:LOCALAPPDATA\abs-agent"
$WrapperUrl = "https://raw.githubusercontent.com/collaed/audiobookshelf/master/agent/abs-wrapper.py"
$AgentUrl = "https://raw.githubusercontent.com/collaed/audiobookshelf/master/agent/abs-agent.py"

Write-Host "=== Audiobookshelf Agent Setup ===" -ForegroundColor Cyan

# Create directory
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null

# Download agent files
Write-Host "Downloading agent files..."
Invoke-WebRequest -Uri $WrapperUrl -OutFile "$AgentDir\abs-wrapper.py"
Invoke-WebRequest -Uri $AgentUrl -OutFile "$AgentDir\abs-agent.py"

# Check Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "Python not found. Install from https://python.org" -ForegroundColor Red
    exit 1
}

# Check ffprobe
$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
if (-not $ffprobe) {
    Write-Host "ffprobe not found. Install ffmpeg from https://ffmpeg.org/download.html" -ForegroundColor Yellow
    Write-Host "  or: winget install ffmpeg" -ForegroundColor Yellow
}

# Create default config
$configPath = "$AgentDir\abs-agent.json"
if (-not (Test-Path $configPath)) {
    @{
        _path_mappings = @{
            "/audiobooks" = "\\zeus\Audiobooks"
            "/incoming" = "\\zeus\Downloads\Audiobooks"
        }
        _agent_token = ""
    } | ConvertTo-Json | Set-Content $configPath
    Write-Host "`nEdit path mappings in: $configPath" -ForegroundColor Yellow
}

# Create scheduled task (runs at login)
$action = New-ScheduledTaskAction -Execute "python" -Argument "abs-wrapper.py --server http://YOUR-SERVER:13378" -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "AudiobookshelfAgent" -Action $action -Trigger $trigger -Settings $settings -Description "Audiobookshelf LAN Agent" -Force

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host "Agent installed to: $AgentDir"
Write-Host "Config: $configPath"
Write-Host "`nTo run manually:"
Write-Host "  cd $AgentDir"
Write-Host "  python abs-wrapper.py --server http://YOUR-SERVER:13378"
Write-Host "`nTo start the scheduled task now:"
Write-Host "  Start-ScheduledTask -TaskName AudiobookshelfAgent"
