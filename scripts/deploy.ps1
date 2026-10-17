param(
  [string]$RepoPath = ".",
  [string]$Message = "Deploy PWA + shader interativo",
  [string]$Remote = "origin",
  [string]$Branch = "main",
  [string]$RemoteUrl = "",
  [switch]$Force
)

Set-StrictMode -Version Latest

try {
  Push-Location -Path $RepoPath
} catch {
  Write-Error "Caminho inválido: $RepoPath"
  exit 1
}

# check git available
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "Git não encontrado no PATH. Instale o Git antes de continuar."
  Pop-Location
  exit 1
}

# ensure inside a git repo
$inside = git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Pasta não é um repositório Git: $RepoPath"
  Pop-Location
  exit 1
}

# optionally set remote
if ($RemoteUrl -ne "") {
  $existing = git remote get-url $Remote 2>$null
  if ($LASTEXITCODE -ne 0) {
	git remote add $Remote $RemoteUrl
	if ($LASTEXITCODE -ne 0) {
	  Write-Error "Falha ao adicionar remote $Remote -> $RemoteUrl"
	  Pop-Location
	  exit 1
	}
	Write-Host "Remote $Remote adicionado: $RemoteUrl"
  } else {
	Write-Host "Remote $Remote já existe: $existing"
  }
}

# avisa antes de stagear: git add -A apanha tudo o que estiver na pasta
$untracked = git ls-files --others --exclude-standard
$nested = Get-ChildItem -Path . -Directory -Recurse -Force -Filter ".git" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -ne (Join-Path (Get-Location) ".git") }
if ($nested) {
  Write-Warning "Repositórios aninhados detectados (não deviam estar aqui):"
  $nested | ForEach-Object { Write-Warning "  $($_.Parent.FullName)" }
}

Write-Host "Alterações a enviar:"
git status --short
if (-not $Force) {
  $answer = Read-Host "Confirma commit e push para $Remote/$Branch? [s/N]"
  if ($answer -notmatch '^[sSyY]') { Write-Host "Cancelado."; Pop-Location; exit 0 }
}

git add -A
if ($LASTEXITCODE -ne 0) { Write-Error "git add falhou"; Pop-Location; exit 1 }

git commit -m "$Message"
if ($LASTEXITCODE -ne 0) { Write-Host "Nada para commitar (working tree limpo) — a ignorar." }

git push $Remote $Branch
if ($LASTEXITCODE -ne 0) { Write-Error "git push falhou. Verifique credenciais e se a branch existe."; Pop-Location; exit 1 }

Write-Host "Push concluído para $Remote/$Branch"
Pop-Location
return 0
