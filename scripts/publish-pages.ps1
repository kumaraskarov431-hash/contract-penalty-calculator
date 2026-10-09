param([string]$Remote = 'origin')

$ErrorActionPreference = 'Stop'
$gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
$gitExe = if ($gitCommand) { $gitCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe' }
if (-not (Test-Path -LiteralPath $gitExe)) { throw 'Git is required.' }

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $changes = & $gitExe status --porcelain -- dist
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read Git status.' }
    if ($changes) { throw 'Commit changes in dist before publishing.' }
    $tree = & $gitExe rev-parse HEAD:dist
    if ($LASTEXITCODE -ne 0) { throw 'Cannot find committed dist directory.' }
    $parent = & $gitExe rev-parse --verify refs/heads/gh-pages 2>$null
    $commitArgs = @('commit-tree', $tree, '-m', 'Publish calculator website')
    if ($LASTEXITCODE -eq 0) { $commitArgs += @('-p', $parent) }
    $commit = & $gitExe @commitArgs
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create Pages commit.' }
    & $gitExe update-ref refs/heads/gh-pages $commit
    if ($LASTEXITCODE -ne 0) { throw 'Cannot update Pages branch.' }
    & $gitExe push $Remote gh-pages
    if ($LASTEXITCODE -ne 0) { throw 'Cannot push Pages branch.' }
} finally {
    Pop-Location
}
