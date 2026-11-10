# Play in PotPlayer for Stremio: subtitles helper (Chrome native messaging host).
#
# The extension cannot pass subtitles through a potplayer: link, so when this helper is
# installed it sends { url, subtitles } here instead. The helper downloads the subtitle
# files to a temp folder and starts PotPlayer with:  PotPlayerMini64.exe "<url>" "<sub1>" "<sub2>" ...
#
# Protocol: each message is a 32-bit little-endian length followed by UTF-8 JSON, on
# stdin/stdout. Nothing else may be written to stdout.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$VERSION = '1.0.0'
$MAX_SUBS = 99   # no real limit: only guards the command line length (32k chars)
$MAX_SUB_BYTES = 10MB
$SUB_EXT = @('.srt', '.vtt', '.ass', '.ssa', '.sub', '.smi', '.sami', '.txt')

# Let Windows pick the TLS version (allows TLS 1.3). Older .NET: allow 1.2 and 1.3 explicitly.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::SystemDefault }
catch { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]'Tls12' -bor [Net.SecurityProtocolType]12288 }

function Read-Message {
    $stdin = [Console]::OpenStandardInput()
    $lenBytes = New-Object byte[] 4
    $read = 0
    while ($read -lt 4) {
        $n = $stdin.Read($lenBytes, $read, 4 - $read)
        if ($n -le 0) { return $null }
        $read += $n
    }
    $len = [BitConverter]::ToInt32($lenBytes, 0)
    if ($len -le 0 -or $len -gt 1MB) { return $null }
    $buf = New-Object byte[] $len
    $read = 0
    while ($read -lt $len) {
        $n = $stdin.Read($buf, $read, $len - $read)
        if ($n -le 0) { return $null }
        $read += $n
    }
    return ([Text.Encoding]::UTF8.GetString($buf) | ConvertFrom-Json)
}

function Write-Message($obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 5
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $stdout = [Console]::OpenStandardOutput()
    $stdout.Write([BitConverter]::GetBytes([int]$bytes.Length), 0, 4)
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

function Find-PotPlayer {
    foreach ($key in 'HKCU:\SOFTWARE\DAUM\PotPlayer64', 'HKLM:\SOFTWARE\DAUM\PotPlayer64', 'HKCU:\SOFTWARE\DAUM\PotPlayer', 'HKLM:\SOFTWARE\DAUM\PotPlayer') {
        try {
            $p = (Get-ItemProperty -Path $key -Name ProgramPath -ErrorAction Stop).ProgramPath
            if ($p -and (Test-Path -LiteralPath $p)) { return $p }
        } catch { }
    }
    # Fall back to the program registered for potplayer: links.
    try {
        $cmd = (Get-ItemProperty -Path 'Registry::HKEY_CLASSES_ROOT\potplayer\shell\open\command' -ErrorAction Stop).'(default)'
        if ($cmd -match '^\s*"([^"]+\.exe)"' -or $cmd -match '^\s*(\S.*?\.exe)') {
            if (Test-Path -LiteralPath $Matches[1]) { return $Matches[1] }
        }
    } catch { }
    return $null
}

function Get-SubFolder {
    $root = Join-Path $env:TEMP 'play-in-potplayer-subs'
    if (Test-Path -LiteralPath $root) {
        # Remove folders from earlier sessions (older than 2 days).
        Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-2) } |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }
    $dir = Join-Path $root (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    return $dir
}

function Read-Compressed([byte[]]$bytes, [int]$skip, [string]$kind) {
    $count = $bytes.Length - $skip
    $src = [IO.MemoryStream]::new($bytes, $skip, $count)
    $in = if ($kind -eq 'gzip') { [IO.Compression.GZipStream]::new($src, [IO.Compression.CompressionMode]::Decompress) }
          else { [IO.Compression.DeflateStream]::new($src, [IO.Compression.CompressionMode]::Decompress) }
    $out = [IO.MemoryStream]::new()
    try { $in.CopyTo($out) } finally { $in.Dispose() }
    if ($out.Length -eq 0) { throw 'empty after decompression' }
    return , $out.ToArray()
}

# Turns a downloaded body into the subtitle file itself:
#  - Content-Encoding: deflate is decoded here, because .NET Framework's own decoder rejects the
#    zlib-wrapped form most servers send ("block length does not match with its complement").
#  - a raw .gz file is unpacked; a .zip file gives its first subtitle file.
function Expand-Subtitle([byte[]]$bytes, [string[]]$encodings) {
    if ($encodings -contains 'deflate') {
        $zlib = $bytes.Length -gt 2 -and ($bytes[0] -band 0x0f) -eq 8 -and ((([int]$bytes[0] -shl 8) + $bytes[1]) % 31) -eq 0
        $order = if ($zlib) { 2, 0 } else { 0, 2 }
        foreach ($skip in $order) {
            try { $bytes = Read-Compressed $bytes $skip 'deflate'; break } catch { }
        }
    }
    if ($bytes.Length -gt 2 -and $bytes[0] -eq 0x1f -and $bytes[1] -eq 0x8b) {
        $bytes = Read-Compressed $bytes 0 'gzip'
    }
    if ($bytes.Length -gt 4 -and $bytes[0] -eq 0x50 -and $bytes[1] -eq 0x4b -and $bytes[2] -eq 3 -and $bytes[3] -eq 4) {
        Add-Type -AssemblyName System.IO.Compression
        $zip = New-Object IO.Compression.ZipArchive((New-Object IO.MemoryStream(, $bytes)), [IO.Compression.ZipArchiveMode]::Read)
        try {
            $entry = $zip.Entries | Where-Object { $SUB_EXT -contains [IO.Path]::GetExtension($_.Name).ToLowerInvariant() } |
                Sort-Object Length -Descending | Select-Object -First 1
            if (-not $entry) { throw 'zip file without a subtitle' }
            $out = New-Object IO.MemoryStream
            $s = $entry.Open(); try { $s.CopyTo($out) } finally { $s.Dispose() }
            $bytes = $out.ToArray()
        } finally { $zip.Dispose() }
    }
    return , $bytes
}

# Downloads all links at the same time. The subtitle server (subs5.strem.io) often answers
# 5xx (e.g. 520) the first time a file is asked for, while it fetches it from OpenSubtitles,
# and then serves it fine: failed downloads are retried after a short wait.
# → array of @{ bytes = byte[] or $null; error = string }
function Get-AllBytes([string[]]$urls) {
    Add-Type -AssemblyName System.Net.Http
    $handler = New-Object Net.Http.HttpClientHandler
    # gzip only: deflate is decoded by Expand-Subtitle (see there).
    $handler.AutomaticDecompression = [Net.DecompressionMethods]::GZip
    $client = New-Object Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(15)
    $client.MaxResponseContentBufferSize = $MAX_SUB_BYTES
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')

    $results = @()
    foreach ($u in $urls) { $results += @{ bytes = $null; error = 'not tried' } }
    $delays = @(0, 1500, 3500)
    try {
        foreach ($delay in $delays) {
            $todo = @(0..($urls.Count - 1) | Where-Object { -not $results[$_].bytes -and $results[$_].error -ne 'final' })
            if (-not $todo.Count) { break }
            if ($delay) { Start-Sleep -Milliseconds $delay }
            $tasks = @{}
            foreach ($i in $todo) { $tasks[$i] = $client.GetAsync($urls[$i]) }
            foreach ($i in $todo) {
                try {
                    $res = $tasks[$i].GetAwaiter().GetResult()
                    $code = [int]$res.StatusCode
                    if ($res.IsSuccessStatusCode) {
                        $bytes = $res.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
                        $enc = [string[]]@($res.Content.Headers.ContentEncoding | ForEach-Object { "$_".ToLowerInvariant() })
                        $results[$i] = @{ bytes = (Expand-Subtitle $bytes $enc); error = $null }
                    } elseif ($code -ge 500 -or $code -eq 429) {
                        $results[$i] = @{ bytes = $null; error = "HTTP $code" }        # retry
                    } else {
                        $results[$i] = @{ bytes = $null; error = 'final'; reason = "HTTP $code" }
                    }
                } catch {
                    $e = $_.Exception
                    while ($e.InnerException) { $e = $e.InnerException }
                    $results[$i] = @{ bytes = $null; error = ($e.Message -replace 'https?://\S+', '<link>') }
                }
            }
        }
    } finally { $client.Dispose() }
    foreach ($r in $results) { if ($r.error -eq 'final') { $r.error = $r.reason } }
    return , $results
}

# The format is read from the content first: some add-ons serve WebVTT from links ending in .srt.
function Get-SubExtension($sub, [byte[]]$bytes) {
    $head = [Text.Encoding]::UTF8.GetString($bytes, 0, [Math]::Min(2000, $bytes.Length)).TrimStart([char]0xFEFF, ' ', [char]9, [char]13, [char]10)
    if ($head -match '^WEBVTT') { return '.vtt' }
    if ($head -match '(?m)^\[Script Info\]') { return '.ass' }
    if ($head -match '^<SAMI') { return '.smi' }
    if ($head -match '^\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->') { return '.srt' }
    foreach ($name in @([string]$sub.fileName, ([string]$sub.url -replace '[?#].*$', ''))) {
        $ext = [IO.Path]::GetExtension($name).ToLowerInvariant()
        if ($SUB_EXT -contains $ext) { return $ext }
    }
    return '.srt'
}

# WebVTT is turned into SRT, the format the other add-ons send, which PotPlayer reads best.
# It also repairs cues written as "NOTE 00:00:00.800 --> 00:00:06.400" with a blank line before their text (seen in
# OpenSubtitles v3+ files). → SRT bytes (UTF-8), or $null if no cue was found.
function ConvertFrom-Vtt([byte[]]$bytes) {
    $text = [Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF) -replace "`r`n?", "`n"
    $lines = $text -split "`n"
    $time = '(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})'
    $cueRe = "^(?:NOTE\s+)?$time\s*-->\s*$time"
    $fmt = {
        param($h, $m, $s, $ms)
        $hh = if ($h) { [int]$h } else { 0 }
        '{0:D2}:{1:D2}:{2:D2},{3}' -f $hh, [int]$m, [int]$s, $ms.PadRight(3, '0').Substring(0, 3)
    }
    $sb = New-Object Text.StringBuilder
    $n = 0
    $i = 0
    while ($i -lt $lines.Count) {
        $match = [regex]::Match($lines[$i].Trim(), $cueRe)
        $i++
        if (-not $match.Success) { continue }
        $g = $match.Groups
        $start = & $fmt $g[1].Value $g[2].Value $g[3].Value $g[4].Value
        $end = & $fmt $g[5].Value $g[6].Value $g[7].Value $g[8].Value

        # Cue text: the lines up to the next blank line.
        $body = @()
        while ($i -lt $lines.Count -and $lines[$i].Trim() -ne '') { $body += $lines[$i]; $i++ }
        if (-not $body.Count) {
            # Broken cue: its text comes after a blank line. Take that block, unless it is
            # another cue (it holds a timing line).
            $j = $i
            while ($j -lt $lines.Count -and $lines[$j].Trim() -eq '') { $j++ }
            $block = @()
            $k = $j
            while ($k -lt $lines.Count -and $lines[$k].Trim() -ne '') { $block += $lines[$k]; $k++ }
            if ($block.Count -and -not ($block | Where-Object { $_ -match '-->' })) { $body = $block; $i = $k }
        }
        if (-not $body.Count) { continue }

        $clean = foreach ($l in $body) {
            $l = $l -replace '<\d{1,2}:\d{2}[:.][\d.:]*>', ''               # karaoke timestamps
            $l = $l -replace '<(?!/?(?:i|b|u|font)\b)[^>]*>', ''            # keep only i/b/u/font tags
            $l -replace '&lt;', '<' -replace '&gt;', '>' -replace '&nbsp;', ' ' -replace '&amp;', '&'
        }
        $n++
        [void]$sb.Append("$n`r`n$start --> $end`r`n").Append(($clean -join "`r`n")).Append("`r`n`r`n")
    }
    if (-not $n) { return $null }
    [byte[]]$srt = [Text.Encoding]::UTF8.GetBytes($sb.ToString())
    return , $srt
}

function Get-SafeName([string]$s) {
    # PotPlayer reads "+" in a subtitle file name as several languages joined ("eng+ara"): it lists
    # the file as "Multiple Languages(...)" and selects it first (tested with PotPlayer 261021,
    # add-on "OpenSubtitles v3+"). So "+" becomes " Plus".
    $s = $s -replace '\+', ' Plus'
    $s = (($s -replace '[\\/:*?"<>|\x00-\x1f]', ' ') -replace '\s{2,}', ' ').Trim()
    if ($s.Length -gt 40) { $s = $s.Substring(0, 40).Trim() }
    return $s
}

function Invoke-Play($msg) {
    $url = [string]$msg.url
    if ($url -notmatch '^https?://' -or $url.Contains('"')) { return @{ ok = $false; reason = 'bad-url' } }
    # PotPlayer reads "\" in a URL as the start of a title ("http://...\title"), and a "\" before the
    # closing quote would break the command line: encode it.
    $url = $url.Replace('\', '%5C')

    $player = Find-PotPlayer
    if (-not $player) { return @{ ok = $false; reason = 'no-potplayer' } }

    $files = @()
    $failed = 0
    $errors = @()
    # @( ) matters: with one subtitle, Windows PowerShell 5.1 gives a lone object without .Count.
    $subs = @(@($msg.subtitles) | Where-Object { $_ -and ([string]$_.url) -match '^https?://' } | Select-Object -First $MAX_SUBS)
    if ($subs.Count) {
        $dir = Get-SubFolder
        $downloads = Get-AllBytes ([string[]]@($subs | ForEach-Object { [string]$_.url }))
        $i = 0
        foreach ($sub in $subs) {
            $i++
            try {
                $d = $downloads[$i - 1]
                if (-not $d.bytes) { throw [string]$d.error }
                $bytes = [byte[]]$d.bytes
                if ($bytes.Length -lt 10) { throw 'empty file' }
                $ext = Get-SubExtension $sub $bytes
                if ($ext -eq '.vtt') {
                    $srt = ConvertFrom-Vtt $bytes
                    if ($srt) { $bytes = $srt; $ext = '.srt' }
                }
                $label = Get-SafeName ([string]$sub.label)
                $lang = Get-SafeName ([string]$sub.lang)
                # "01 Arabic - OpenSubtitles.ara.srt": PotPlayer lists subtitles by file name.
                $base = '{0:D2}' -f $i
                if ($label) { $base += " $label" }
                if ($lang) { $base += ".$lang" }
                $path = Join-Path $dir ($base + $ext)
                [IO.File]::WriteAllBytes($path, $bytes)
                $files += $path
            } catch {
                $failed++
                # Reason only, never the link (it can hold add-on tokens).
                $e = $_.Exception
                while ($e.InnerException) { $e = $e.InnerException }
                $errors += ('{0}: {1}' -f $i, ($e.Message -replace 'https?://\S+', '<link>'))
            }
        }
    }

    # PotPlayer reads only the first /sub= switch, so the subtitle files are passed as extra
    # items after the video instead: PotPlayer attaches them all to the video as subtitle
    # tracks and selects the first one (tested with PotPlayer 261021).
    $argList = '"' + $url + '"'
    foreach ($f in $files) { $argList += ' "' + $f + '"' }
    Start-Process -FilePath $player -ArgumentList $argList
    return @{ ok = $true; subtitles = $files.Count; failed = $failed; errors = $errors }
}

# Dot-sourcing (". .\host.ps1") only loads the functions, for testing.
if ($MyInvocation.InvocationName -eq '.') { return }

try {
    $msg = Read-Message
    if (-not $msg) { exit 0 }
    switch ([string]$msg.type) {
        'ping' { Write-Message @{ ok = $true; version = $VERSION; potplayer = [bool](Find-PotPlayer) } }
        'play' { Write-Message (Invoke-Play $msg) }
        default { Write-Message @{ ok = $false; reason = 'unknown-message' } }
    }
} catch {
    try { Write-Message @{ ok = $false; reason = 'error'; detail = [string]$_.Exception.Message } } catch { }
}
