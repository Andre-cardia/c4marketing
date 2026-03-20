# ================================================================
# Configurar secrets do GitHub para o canário de memória cognitiva
# Uso: .\scripts\setup_github_secrets.ps1
# ================================================================

param(
    [string]$SupabaseUrl        = $env:VITE_SUPABASE_URL,
    [string]$SupabaseAnonKey    = $env:VITE_SUPABASE_ANON_KEY,
    [string]$ServiceRoleKey     = $env:SUPABASE_SERVICE_ROLE_KEY,
    [string]$Repo               = "Andre-cardia/c4marketing"
)

# Verificar gh CLI
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "gh CLI nao encontrado. Instale em: https://cli.github.com/"
    exit 1
}

# Verificar autenticacao
$ghStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Nao autenticado no gh CLI. Execute: gh auth login"
    exit 1
}

# Se nao foram passados via param/env, perguntar interativamente
if (-not $SupabaseUrl) {
    $SupabaseUrl = Read-Host "VITE_SUPABASE_URL (ex: https://xxxx.supabase.co)"
}
if (-not $SupabaseAnonKey) {
    $SupabaseAnonKey = Read-Host "VITE_SUPABASE_ANON_KEY"
}
if (-not $ServiceRoleKey) {
    $ServiceRoleKey = Read-Host "SUPABASE_SERVICE_ROLE_KEY"
}

if (-not $SupabaseUrl -or -not $SupabaseAnonKey -or -not $ServiceRoleKey) {
    Write-Error "Todos os 3 valores sao obrigatorios."
    exit 1
}

Write-Host "Configurando secrets em $Repo ..." -ForegroundColor Cyan

$SupabaseUrl     | gh secret set VITE_SUPABASE_URL     --repo $Repo
$SupabaseAnonKey | gh secret set VITE_SUPABASE_ANON_KEY --repo $Repo
$ServiceRoleKey  | gh secret set SUPABASE_SERVICE_ROLE_KEY --repo $Repo

if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao configurar um ou mais secrets."
    exit 1
}

Write-Host "Secrets configurados com sucesso!" -ForegroundColor Green

# Disparar workflow manualmente
Write-Host "Disparando workflow canario manualmente..." -ForegroundColor Cyan
gh workflow run brain-memory-long-horizon-daily.yml --repo $Repo

if ($LASTEXITCODE -eq 0) {
    Write-Host "Workflow disparado! Acompanhe em:" -ForegroundColor Green
    Write-Host "https://github.com/$Repo/actions/workflows/brain-memory-long-horizon-daily.yml" -ForegroundColor Yellow
} else {
    Write-Warning "Secrets configurados, mas falha ao disparar workflow. Dispare manualmente no GitHub Actions."
}
