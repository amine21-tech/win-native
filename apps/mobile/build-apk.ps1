# =============================================================================
# WIN — produit l'APK Android et affiche le lien de telechargement.
#
# A lancer depuis PowerShell, dans le dossier apps\mobile :
#     .\build-apk.ps1
#
# La compilation ne se fait PAS sur votre PC : le code est envoye chez Expo,
# qui compile sur ses machines et renvoie un lien. Vous n'avez besoin ni
# d'Android Studio, ni du SDK Android, ni de 10 Go de telechargement.
# =============================================================================

$ErrorActionPreference = 'Stop'

function Etape($n, $texte) {
    Write-Host ""
    Write-Host "  [$n] $texte" -ForegroundColor Cyan
    Write-Host ""
}
function Bien($texte) { Write-Host "      $texte" -ForegroundColor Green }
function Souci($texte) { Write-Host "      $texte" -ForegroundColor Yellow }

# Une commande eas qui echoue ne doit PAS laisser le script continuer :
# sinon il affiche « Termine » alors que rien n'a ete produit.
function Verifier($quoi) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  Echec : $quoi" -ForegroundColor Red
        Write-Host "  Le script s'arrete ici. Rien n'a ete casse." -ForegroundColor Red
        Write-Host ""
        exit 1
    }
}

Write-Host ""
Write-Host "  WIN - construction de l'APK Android" -ForegroundColor White
Write-Host "  ===================================" -ForegroundColor DarkGray

# --- 1. Node --------------------------------------------------------------
Etape 1 "Verification de Node"

try {
    $versionNode = (node -v).TrimStart('v')
} catch {
    throw "Node n'est pas installe. Telechargez la version LTS sur https://nodejs.org puis relancez ce script."
}

$majeure = [int]($versionNode -split '\.')[0]
if ($majeure -lt 22) {
    throw "Node $versionNode est trop ancien. Il faut la version 22 ou plus : https://nodejs.org"
}
Bien "Node $versionNode"

# --- 2. Dependances -------------------------------------------------------
Etape 2 "Installation des dependances (quelques minutes la premiere fois)"

$racine = Resolve-Path (Join-Path $PSScriptRoot '..\..')

Push-Location $racine
npm install --no-audit --no-fund
# L'application importe @win/shared, qui doit etre compile avant d'etre lisible.
npm run build --workspace @win/shared
Pop-Location

Push-Location $PSScriptRoot
npm install --no-audit --no-fund
Bien "Dependances pretes"

# --- 2 bis. Code partage ---------------------------------------------------
Etape "2 bis" "Recopie du code partage"

# EAS Build n'envoie que le dossier apps/mobile. Une dependance `file:../../`
# sort de l'archive et Metro echoue avec « ENOENT ... packages/shared ».
# On recopie donc les sources partagees dans src/shared/ avant chaque
# compilation : packages/shared reste la seule source de verite.
$sourcePartagee = Join-Path $racine 'packages\shared\src'
$ciblePartagee = Join-Path $PSScriptRoot 'src\shared'

if (Test-Path $sourcePartagee) {
    New-Item -ItemType Directory -Force -Path $ciblePartagee | Out-Null
    Get-ChildItem $ciblePartagee -Filter *.ts -ErrorAction SilentlyContinue | Remove-Item -Force
    $entete = @'
// ---------------------------------------------------------------------------
// FICHIER RECOPIE - NE PAS MODIFIER ICI.
// La source est packages/shared/src/. Recopie par build-apk.ps1.
// ---------------------------------------------------------------------------

'@
    $nb = 0
    Get-ChildItem $sourcePartagee -Filter *.ts | ForEach-Object {
        # -Encoding UTF8 est indispensable ici : sans lui, PowerShell 5.1 lit un fichier UTF-8
        # sans BOM comme s'il etait en ANSI des qu'il contient un accent, et le reecrit corrompu
        # (ex: "aeroports" devient "aÃ©roports") — invisible dans un commentaire, mais une syntaxe
        # invalide des que ca tombe sur du code (c'est exactement ce qui a fait echouer le build).
        $texte = Get-Content $_.FullName -Raw -Encoding UTF8
        # Metro ne resout pas un specifier en .js pointant vers un fichier .ts
        $texte = $texte -replace "(from '\./[a-zA-Z0-9_-]+)\.js'", "`$1'"
        Set-Content -Path (Join-Path $ciblePartagee $_.Name) -Value ($entete + $texte) -Encoding UTF8
        $nb++
    }
    Bien "$nb fichier(s) partage(s) recopie(s) dans src/shared"
} else {
    Souci "packages/shared introuvable : on garde la copie existante."
}

# --- 3. eas-cli -----------------------------------------------------------
Etape 3 "Verification de l'outil de compilation Expo"

$easPresent = $null -ne (Get-Command eas -ErrorAction SilentlyContinue)
if (-not $easPresent) {
    Souci "eas-cli absent, installation en cours..."
    npm install -g eas-cli
}
Bien "eas-cli $(eas --version)"

# --- 4. Compte Expo -------------------------------------------------------
Etape 4 "Compte Expo"

if (-not [string]::IsNullOrWhiteSpace($env:EXPO_TOKEN)) {
    # EXPO_TOKEN suffit a lui seul pour authentifier toutes les commandes eas qui suivent.
    # `eas login` refuse meme de s'executer tant que cette variable est presente (a raison :
    # melanger jeton et identifiants preterait a confusion) — donc on ne l'appelle pas ici.
    Bien "Authentifie via EXPO_TOKEN"
} else {
    # On se fie au CODE DE SORTIE de `eas whoami`, jamais a ce qu'il ecrit.
    #
    # L'ancienne version capturait sa sortie avec `2>$null`. Or rediriger la sortie d'erreur
    # d'un programme externe fait emballer chaque ligne par PowerShell dans une erreur : il
    # suffisait qu'eas-cli signale une mise a jour disponible -- ce qu'il fait sur la sortie
    # d'erreur, sans que rien n'aille mal -- pour que le `catch` conclue "pas connecte".
    #
    # Le script appelait alors `eas login`, qui repond "deja connecte" puis demande
    # confirmation. Lance sans clavier (tache de fond, integration continue), il n'a personne
    # pour repondre et s'arrete -- alors que le compte etait connecte depuis le debut.
    $sortie = eas whoami
    if ($LASTEXITCODE -ne 0) {
        Souci "Vous n'etes pas connecte. Creez un compte gratuit sur https://expo.dev si besoin."
        eas login
        Verifier "connexion au compte Expo"
        $sortie = eas whoami
        Verifier "lecture du compte Expo"
    }
    $qui = ($sortie | Where-Object { $_ -match '\S' } | Select-Object -First 1)
    Bien "Connecte en tant que $qui"
}

# --- 5. Identifiant de projet --------------------------------------------
Etape 5 "Identifiant de projet"

$config = Get-Content (Join-Path $PSScriptRoot 'app.json') -Raw | ConvertFrom-Json
$projet = $config.expo.extra.eas.projectId

if ([string]::IsNullOrWhiteSpace($projet) -or $projet -like 'a-renseigner*') {
    Souci "Premier lancement : creation du projet chez Expo."
    eas init
    Verifier "creation du projet chez Expo"
} else {
    Bien "Projet deja enregistre ($projet)"
}

# --- 6. Compilation -------------------------------------------------------
Etape 6 "Compilation de l'APK chez Expo"

Write-Host "      Comptez 20 a 45 minutes. Vous pouvez fermer cette fenetre :" -ForegroundColor DarkGray
Write-Host "      la compilation continue, et le lien reste disponible sur" -ForegroundColor DarkGray
Write-Host "      https://expo.dev dans la section Builds." -ForegroundColor DarkGray
Write-Host ""

# --non-interactive : sans ca, eas propose d'installer automatiquement sur un emulateur Android
# connecte a CETTE machine une fois la compilation terminee. Sans emulateur configure ici (le cas
# courant), cette etape optionnelle echoue et le script s'arrete en erreur — alors que l'APK, lui,
# est deja pret et telechargeable. On ne s'en sert pas : l'installation se fait sur le telephone.
eas build --platform android --profile preview --non-interactive
Verifier "compilation de l'APK"

Pop-Location

Write-Host ""
Write-Host "  Termine." -ForegroundColor Green
Write-Host "  Ouvrez le lien affiche ci-dessus sur votre telephone, telechargez" -ForegroundColor White
Write-Host "  le fichier .apk et autorisez l'installation depuis cette source." -ForegroundColor White
Write-Host ""
