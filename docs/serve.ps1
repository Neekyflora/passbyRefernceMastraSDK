param(
    [int]$Port = 8000
)

# Check if HttpListener is supported (it is on Windows desktop)
if (-not ([System.Management.Automation.PSTypeName]'System.Net.HttpListener').Type) {
    Write-Error "HttpListener is not available on this system."
    exit 1
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host "Local server started!" -ForegroundColor Green
Write-Host "Open your browser at http://localhost:$Port" -ForegroundColor Cyan
Write-Host "Press Ctrl + C to stop`n" -ForegroundColor Yellow

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Default to index.html
        $localPath = $request.Url.LocalPath
        if ($localPath -eq "/") { $localPath = "/index.html" }

        $filePath = Join-Path $PWD ($localPath.Substring(1))

        # === CORS header – this fixes your JSON loading problem ===
        $response.AddHeader("Access-Control-Allow-Origin", "*")

        if (Test-Path $filePath -PathType Leaf) {
            $buffer = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $buffer.Length

            # Simple MIME type mapping (PowerShell 5 compatible)
            $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($extension) {
                ".html"  { "text/html" }
                ".htm"   { "text/html" }
                ".css"   { "text/css" }
                ".js"    { "application/javascript" }
                ".json"  { "application/json" }
                ".png"   { "image/png" }
                ".jpg"   { "image/jpeg" }
                ".jpeg"  { "image/jpeg" }
                ".gif"   { "image/gif" }
                ".svg"   { "image/svg+xml" }
                ".ico"   { "image/x-icon" }
                ".woff"  { "font/woff" }
                ".woff2" { "font/woff2" }
                ".ttf"   { "font/ttf" }
                default  { "application/octet-stream" }
            }

            $response.ContentType = $contentType
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.StatusCode = 200
        }
        else {
            $response.StatusCode = 404
            $msg = [Text.Encoding]::UTF8.GetBytes("404 - Not Found")
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }

        $response.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}