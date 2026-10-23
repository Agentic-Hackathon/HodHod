param([string]$Model='gpt-5-mini',[string]$BaseUrl='https://api.openai.com/v1')
$ErrorActionPreference='Stop'
$taskEnv=Join-Path $PSScriptRoot '.env'
$taskSecure=Read-Host 'OpenAI-compatible API key (hidden)' -AsSecureString
$taskPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
try {
 $taskKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
 if (-not $taskKey.Trim()) {throw 'API key cannot be empty.'}
 foreach ($taskValue in @($taskKey,$Model,$BaseUrl)) {if ($taskValue.Contains("`n") -or $taskValue.Contains("`r") -or $taskValue.Contains("'")) {throw 'Invalid configuration value.'}}
 $taskLines=@()
 if (Test-Path -LiteralPath $taskEnv) {$taskLines=@([IO.File]::ReadAllLines($taskEnv) | Where-Object {$_ -notmatch '^\s*(LLM_PROVIDER|LLM_MODEL|LLM_API_KEY|LLM_BASE_URL|AGENT_MODE)\s*='})}
 $taskLines+=@('LLM_PROVIDER=openai',"LLM_MODEL='$Model'","LLM_BASE_URL='$BaseUrl'","LLM_API_KEY='$taskKey'",'AGENT_MODE=llm')
 [IO.File]::WriteAllLines($taskEnv,$taskLines,[Text.UTF8Encoding]::new($false))
 Write-Host 'Model configured. Restart start.ps1 to load it.'
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)
 $taskKey=$null
}
