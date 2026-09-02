# Renders every spoken form in keywords_raw.txt (plus a few decoy sentences)
# to WAV with the Windows voices, for `cargo run --release --example kws_eval`.
# Synthetic speech is not a microphone, but it catches phrases the model
# systematically can't hear and any regression in the capture-side DSP.
#
#   powershell -File tools/kws-eval/synth.ps1 [-Out <dir>] [-Rates 16000,48000]
#
# Output: <Out>/wav<rate>/<id>__<voice>__<phrase>.wav; decoys use id `none`.
param(
  [string]$Raw = (Join-Path $PSScriptRoot '..\..\src-tauri\resources\kws\keywords_raw.txt'),
  [string]$Out = (Join-Path $PSScriptRoot 'out'),
  [int[]]$Rates = @(16000, 48000),
  [string[]]$Voices = @('Microsoft David Desktop', 'Microsoft Zira Desktop', 'Microsoft Mark')
)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$installed = $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
$lines = Get-Content $Raw | Where-Object { $_.Trim() -ne '' }
$decoys = @(
  'the quick brown fox jumps over the lazy dog',
  'come pass the salt please',
  'what a compassionate thing to do',
  'next time we go back to town',
  'i need a new helmet and boots for this build',
  'start the timer when you are ready',
  'the stash tab is full of gems',
  'lock the door on your way out',
  'my compass is broken',
  'compass',
  'come on lets go',
  'that map was rough we should split up'
)
foreach ($rate in $Rates) {
  $dir = Join-Path $Out "wav$rate"
  New-Item -ItemType Directory -Force $dir | Out-Null
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo($rate, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  foreach ($voice in $Voices) {
    if ($installed -notcontains $voice) { Write-Warning "voice not installed: $voice"; continue }
    $s.SelectVoice($voice)
    $tag = $voice -replace '[^A-Za-z]', ''
    foreach ($line in $lines) {
      $words = $line.Split(' ') | Where-Object { $_ -ne '' }
      $phrase = ($words | Where-Object { -not ($_.StartsWith('@') -or $_.StartsWith(':') -or $_.StartsWith('#')) }) -join ' '
      $id = ($words | Where-Object { $_.StartsWith('@') } | Select-Object -First 1).Substring(1)
      $file = Join-Path $dir ('{0}__{1}__{2}.wav' -f $id, $tag, ($phrase.ToLower() -replace ' ', '-'))
      $s.SetOutputToWaveFile($file, $fmt)
      $s.Speak($phrase.ToLower())
      $s.SetOutputToNull()
    }
    $i = 0
    foreach ($d in $decoys) {
      $i++
      $file = Join-Path $dir ('none__{0}__{1}.wav' -f $tag, $i)
      $s.SetOutputToWaveFile($file, $fmt)
      $s.Speak($d)
      $s.SetOutputToNull()
    }
  }
  Write-Host "wrote $((Get-ChildItem $dir -Filter *.wav).Count) files to $dir"
}
