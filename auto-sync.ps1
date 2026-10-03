# Started by auto-sync.bat: keeps the sync running and restarts it if it stops.
#
# QuickEdit is switched off first. With it on, a click in this window starts a
# text selection and Windows pauses the sync until a key is pressed. This
# script must stay running for that to hold: PowerShell switches QuickEdit
# back on when it exits.
$k = Add-Type -Name Console -Namespace AutoSync -PassThru -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int handle);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr handle, out uint mode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr handle, uint mode);
'@
$handle = $k::GetStdHandle(-10)  # console input
$mode = [uint32]0
if ($k::GetConsoleMode($handle, [ref]$mode)) {
  # Clear ENABLE_QUICK_EDIT_MODE (0x40); ENABLE_EXTENDED_FLAGS (0x80) makes it apply.
  [void]$k::SetConsoleMode($handle, (($mode -band (-bnot 0x40)) -bor 0x80))
}

Set-Location $PSScriptRoot
while ($true) {
  node src\sync.js --auto
  Write-Host ''
  Write-Host 'Sync stopped. Restarting in 30 seconds... (close this window to stop)'
  Start-Sleep -Seconds 30
}
