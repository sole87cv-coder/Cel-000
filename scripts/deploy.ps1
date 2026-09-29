param(
  [string]$RepoPath = ".",
  [string]$Message = "Deploy PWA + shader interativo",
  [string]$Remote = "origin",
  [string]$Branch = "main",
  [string]$RemoteUrl = ""
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

# stage, commit and push
git add .
if ($LASTEXITCODE -ne 0) { Write-Error "git add falhou"; Pop-Location; exit 1 }

git commit -m "$Message" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Nenhuma alteração para commitar ou commit falhou (verifique)." }

git push $Remote $Branch
if ($LASTEXITCODE -ne 0) { Write-Error "git push falhou. Verifique credenciais e se a branch existe."; Pop-Location; exit 1 }

Write-Host "Push concluído para $Remote/$Branch"
Pop-Location
return 0
