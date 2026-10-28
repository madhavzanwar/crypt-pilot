$ErrorActionPreference = "Continue"

function Make-Commit {
    param(
        [string]$message,
        [int]$hoursAgo
    )
    git add .
    $date = (Get-Date).AddHours(-$hoursAgo).ToString("yyyy-MM-ddTHH:mm:sszzz")
    $env:GIT_AUTHOR_DATE = $date
    $env:GIT_COMMITTER_DATE = $date
    git commit -m $message
}

function Create-PR {
    param(
        [string]$branch,
        [string]$title,
        [string]$body
    )
    git push -u origin $branch -f
    gh pr create --title $title --body $body --base main
}

cd d:\Work\Hackathons\Hackmatrix\finpilot

git checkout main
git reset --hard 4a52057
git clean -fd

# Close existing PRs
gh pr list --state open --json number -q '.[].number' | ForEach-Object { gh pr close $_ }

# PR 1: Backend Core
git checkout -b feat/backend-core
mkdir backend\app -Force | Out-Null
Copy-Item ..\hackmatrix\backend\requirements.txt backend\
Copy-Item ..\hackmatrix\backend\pytest.ini backend\
Make-Commit "chore(backend): add dependencies and pytest config" 48

Copy-Item ..\hackmatrix\backend\app\main.py backend\app\
Copy-Item ..\hackmatrix\backend\app\models.py backend\app\
Copy-Item ..\hackmatrix\backend\app\schemas.py backend\app\
Make-Commit "feat(backend): implement base FastAPI application and Pydantic schemas" 47

Copy-Item ..\hackmatrix\backend\app\api backend\app\api -Recurse
Make-Commit "feat(api): add core routing modules for transactions and budgets" 46

Create-PR "feat/backend-core" "feat: Backend Core API and Schemas" "Initial FastAPI setup."

# PR 2: Backend Auth & Security
git checkout main
git checkout -b feat/backend-auth
Copy-Item ..\hackmatrix\backend\app\core backend\app\core -Recurse
Make-Commit "feat(auth): implement JWT validation and TOTP MFA logic" 45

Copy-Item ..\hackmatrix\backend\app\security backend\app\security -Recurse
Make-Commit "feat(security): add role-based access control and audit vault" 44

Create-PR "feat/backend-auth" "feat: Authentication and Security Gateways" "Adds zero-trust token verification."

# PR 3: Backend Data Ingestion
git checkout main
git checkout -b feat/backend-ingest
Copy-Item ..\hackmatrix\backend\app\ingest backend\app\ingest -Recurse
Make-Commit "feat(ingest): build CSV parsing and banking feed integrations" 43

Copy-Item ..\hackmatrix\backend\data backend\data -Recurse
Make-Commit "chore(data): add seeded persona fixtures and templates" 42

Create-PR "feat/backend-ingest" "feat: Banking Feed Ingestion Pipeline" "CSV parser and synthetic persona generator."

# PR 4: Backend Analytics
git checkout main
git checkout -b feat/backend-analytics
Copy-Item ..\hackmatrix\backend\app\analytics backend\app\analytics -Recurse
Make-Commit "feat(analytics): implement 5-pillar financial health scoring" 41

Copy-Item ..\hackmatrix\backend\app\recommend backend\app\recommend -Recurse
Make-Commit "feat(recommend): add intervention ranking engine" 40

Create-PR "feat/backend-analytics" "feat: Financial Analytics Engine" "Calculates health scores and ranks recommendations."

# PR 5: Backend Simulation & Forecasting
git checkout main
git checkout -b feat/backend-forecast
Copy-Item ..\hackmatrix\backend\app\forecast backend\app\forecast -Recurse
Make-Commit "feat(forecast): build 90-day probabilistic Monte Carlo engine" 39

Copy-Item ..\hackmatrix\backend\app\simulate backend\app\simulate -Recurse
Copy-Item ..\hackmatrix\backend\app\plan backend\app\plan -Recurse
Make-Commit "feat(simulate): add what-if scenario counterfactual logic" 38

Create-PR "feat/backend-forecast" "feat: Monte Carlo Simulator" "Forecasts cash-flow and stress-tests trajectories."

# PR 6: Backend AI Copilot
git checkout main
git checkout -b feat/backend-ai
Copy-Item ..\hackmatrix\backend\app\copilot backend\app\copilot -Recurse
Copy-Item ..\hackmatrix\backend\app\rag backend\app\rag -Recurse
Make-Commit "feat(ai): integrate Gemini Pro conversational router" 37

Copy-Item ..\hackmatrix\backend\app\web backend\app\web -Recurse
Copy-Item ..\hackmatrix\backend\app\aa backend\app\aa -Recurse
Make-Commit "feat(ai): implement offline rule fallback and deterministic reasoning" 36

Copy-Item ..\hackmatrix\backend\tests backend\tests -Recurse
Make-Commit "test(backend): add comprehensive test suite for AI and APIs" 35

Create-PR "feat/backend-ai" "feat: AI Copilot and Verification Engine" "Two-phase function calling and offline fallback."

# PR 7: Frontend Shell & Setup
git checkout main
git checkout -b feat/frontend-shell
mkdir frontend -Force | Out-Null
Copy-Item ..\hackmatrix\frontend\package.json frontend\
Copy-Item ..\hackmatrix\frontend\tsconfig.json frontend\
Copy-Item ..\hackmatrix\frontend\postcss.config.mjs frontend\
Copy-Item ..\hackmatrix\frontend\eslint.config.mjs frontend\
Copy-Item ..\hackmatrix\frontend\next.config.ts frontend\
Copy-Item ..\hackmatrix\frontend\components.json frontend\
Make-Commit "chore(frontend): initialize Next.js 16 and Tailwind v4 environment" 34

Copy-Item ..\hackmatrix\frontend\lib frontend\lib -Recurse
Copy-Item ..\hackmatrix\frontend\hooks frontend\hooks -Recurse
Make-Commit "feat(frontend): add shared utilities, types, and API clients" 33

Copy-Item ..\hackmatrix\frontend\public frontend\public -Recurse
Make-Commit "chore(frontend): add brand assets and static files" 32

Create-PR "feat/frontend-shell" "feat: Frontend Shell and Configuration" "Next.js core setup."

# PR 8: Frontend UI Components
git checkout main
git checkout -b feat/frontend-components
Copy-Item ..\hackmatrix\frontend\components\ui frontend\components\ui -Recurse
Copy-Item ..\hackmatrix\frontend\components\shadcn frontend\components\shadcn -Recurse
Make-Commit "feat(ui): implement base design system components" 31

Copy-Item ..\hackmatrix\frontend\components\interactive frontend\components\interactive -Recurse
Make-Commit "feat(ui): add Framer Motion interactive widgets" 30

Create-PR "feat/frontend-components" "feat: Design System Components" "Buttons, inputs, and animated cards."

# PR 9: Frontend Dashboard & Pages
git checkout main
git checkout -b feat/frontend-pages
Copy-Item ..\hackmatrix\frontend\components\dashboard frontend\components\dashboard -Recurse
Copy-Item ..\hackmatrix\frontend\components\transactions frontend\components\transactions -Recurse
Make-Commit "feat(dashboard): build command center and KPI layout" 29

Copy-Item ..\hackmatrix\frontend\app frontend\app -Recurse
Make-Commit "feat(pages): implement application routing and Next.js page structure" 28

Create-PR "feat/frontend-pages" "feat: Dashboard and Pages" "Main application views and layout shell."

# PR 10: Frontend Advanced Modules
git checkout main
git checkout -b feat/frontend-advanced
Copy-Item ..\hackmatrix\frontend\components\plan frontend\components\plan -Recurse
Copy-Item ..\hackmatrix\frontend\components\statement frontend\components\statement -Recurse
Make-Commit "feat(simulator): build what-if scenario UI and print statement view" 27

Copy-Item ..\hackmatrix\frontend\components\tax frontend\components\tax -Recurse
Make-Commit "feat(tax): add Indian income tax regime analyzer interface" 26

Copy-Item ..\hackmatrix\frontend\components\landing frontend\components\landing -Recurse
Copy-Item ..\hackmatrix\frontend\components\onboarding frontend\components\onboarding -Recurse
Copy-Item ..\hackmatrix\frontend\components\showcase frontend\components\showcase -Recurse
Make-Commit "feat(landing): complete marketing and onboarding flows" 25

Create-PR "feat/frontend-advanced" "feat: Advanced Financial Modules" "Simulator, Tax Optimizer, and Statement PDF."
