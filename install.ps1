# Installs Mira on Windows, built from source. In PowerShell or cmd:
#   powershell -ExecutionPolicy Bypass -c "iex (curl.exe -fsSL https://raw.githubusercontent.com/jbw9/understand-slop/main/install.ps1 | Out-String)"
# The source is kept in ~\.mira\src (MIRA_DIR moves it); running this again updates and rebuilds.
# This is app/scripts/install-app.sh for Windows, with the fetch from install.sh before it.
# Run through iex, so it returns or throws instead of `exit`, which would close the caller's shell.
# Windows PowerShell 5.1 runs it too: no `&&`, `??` or ternaries.

function Install-Mira {
  $ErrorActionPreference = 'Stop'
  $repo = if ($env:MIRA_REPO) { $env:MIRA_REPO } else { 'https://github.com/jbw9/understand-slop.git' }
  $ref = if ($env:MIRA_REF) { $env:MIRA_REF } else { 'main' }
  $dir = Join-Path $(if ($env:MIRA_DIR) { $env:MIRA_DIR } else { Join-Path $HOME '.mira' }) 'src'
  # rustup's default place, for a shell opened before Rust was installed.
  $cargoBin = Join-Path $HOME '.cargo\bin'
  if ((Test-Path (Join-Path $cargoBin 'cargo.exe')) -and ($env:PATH -notlike "*$cargoBin*")) { $env:PATH = "$cargoBin;$env:PATH" }

  $missing = @()
  $needs = [ordered]@{
    git   = 'winget install Git.Git'
    node  = 'Node 20 or newer: winget install OpenJS.NodeJS.LTS'
    cargo = 'Rust: https://rustup.rs, with the Visual Studio C++ build tools it asks for'
    cmake = 'winget install Kitware.CMake'
  }
  foreach ($c in $needs.Keys) {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { $missing += "  - ${c}: $($needs[$c])" }
  }
  if ($missing) {
    Write-Host "Mira builds from source, and needs:`n$($missing -join "`n")`nInstall those, open a new terminal, then run this again." -ForegroundColor Red
    return
  }
  if ([int](node -p "process.versions.node.split('.')[0]") -lt 20) {
    Write-Host "Mira needs Node 20 or newer; this is $(node -v)." -ForegroundColor Red
    return
  }

  # Native commands don't throw on failure, so the exit code is checked; and under Stop, some
  # hosts of PowerShell 5.1 turn a native program's stderr (git's and npm's progress) into an error.
  function Run {
    $ErrorActionPreference = 'Continue'
    & $args[0] @($args | Select-Object -Skip 1)
    if ($LASTEXITCODE) { throw "$($args -join ' ') failed ($LASTEXITCODE)" }
  }
  function Say($m) { Write-Host "==> $m" -ForegroundColor Cyan }

  Say "Getting the source into $dir"
  New-Item -ItemType Directory -Force $dir | Out-Null
  Run git init -q $dir
  Run git -C $dir fetch -q --depth 1 $repo $ref
  Run git -C $dir checkout -q -f --detach FETCH_HEAD
  Run git -C $dir clean -qfd

  $app = Join-Path $dir 'app'
  Push-Location $app
  try {
    Say 'Installing packages'
    # The .cmd, not npm.ps1, which a Restricted execution policy refuses to run.
    Run npm.cmd ci --no-audit --no-fund

    Say 'Building Mira (the first build compiles the app: 10 to 20 minutes)'
    # Tauri's app_data_dir on Windows; src-tauri/src/server.rs starts the server from there.
    $data = Join-Path $env:APPDATA 'dev.mira.app'
    $snap = Join-Path $data 'server'
    $next = Join-Path $data 'server-next'
    New-Item -ItemType Directory -Force $data | Out-Null
    if (Test-Path $next) { Remove-Item -Recurse -Force $next }
    robocopy $app $next /MIR /XD (Join-Path $app 'src-tauri') (Join-Path $app '.next') (Join-Path $app 'out') /XF *.tsbuildinfo /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copying the app to $next failed ($LASTEXITCODE)" }
    Push-Location $next
    try { Run node node_modules/next/dist/bin/next build } finally { Pop-Location }
    # The Node and PATH of this shell, minus npm's node_modules folders, for a Mira opened from the Start menu.
    $path = ($env:PATH -split ';' | Where-Object { $_ -and $_ -notlike '*\node_modules\*' }) -join ';'
    $envJson = @{ node = (Get-Command node).Source; path = $path } | ConvertTo-Json -Compress
    # WriteAllText writes UTF-8 without the BOM PowerShell 5.1 adds, which serde_json refuses.
    [IO.File]::WriteAllText((Join-Path $next 'env.json'), "$envJson`n")

    Run npx.cmd tauri build --no-bundle

    # A running Mira holds its exe and its server open.
    Get-Process -Name mira -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-NetTCPConnection -LocalPort 3123 -State Listen -ErrorAction SilentlyContinue |
      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    if (Test-Path $snap) { Remove-Item -Recurse -Force $snap }
    Move-Item $next $snap

    $bin = Join-Path $env:LOCALAPPDATA 'Programs\Mira'
    New-Item -ItemType Directory -Force $bin | Out-Null
    $exe = Join-Path $bin 'Mira.exe'
    Copy-Item (Join-Path $app 'src-tauri\target\release\mira.exe') $exe -Force
    $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Mira.lnk'))
    $lnk.TargetPath = $exe
    $lnk.WorkingDirectory = $bin
    $lnk.Save()
    Write-Host "Installed $exe, with Mira in the Start menu." -ForegroundColor Green
    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
      Say "Mira makes maps through Claude Code, which isn't on your PATH: https://claude.com/claude-code"
    }
  } finally { Pop-Location }
}

Install-Mira
