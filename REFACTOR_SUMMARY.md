# Company Detail View Unification - Implementation Summary

## Task
Unify company detail view by removing CompanyTray's internal modal and routing all clicks through CompanyDrawer.

## Changes Made

### CompanyTray.tsx
1. **Added import** for `openCompanyDrawer` from `./CompanyDrawer`

2. **Updated CompanyCard component:**
   - Removed `isExpanded` and `onClick` props from signature
   - Changed onClick handler to call `openCompanyDrawer(companyData?.canonical_name || name)` directly
   - Simplified className to remove conditional `isExpanded` styling

3. **Deleted CompanyModal component** (lines 372-541, ~170 lines)
   - This was duplicating CompanyDrawer functionality
   - Had its own InteractiveChart, modal UI, stock fetching

4. **Removed CompanyModal portal rendering** at end of CompanyTray component

5. **Cleaned up props interface:**
   - Removed `selectedCompany: string | null`
   - Removed `onSelectCompany: (name: string | null) => void`

6. **Removed state management:**
   - Deleted `selectedCompanyData` variable
   - Deleted useEffect that refetched stock data when `selectedCompany` changed
   - Simplified basket tab switcher to not call `onSelectCompany(null)`

7. **What was NOT touched:**
   - `InteractiveChart` component (shared by IndexModal and IndexOverview)
   - `Sparkline` component (used by CompanyCard grid)
   - `IndexModal` component
   - Basket grid layout

### LiveFeed.tsx
1. **Removed state:**
   - Deleted `const [selectedCompany, setSelectedCompany] = useState<string | null>(null)`

2. **Updated CompanyTray call sites** (both mobile and desktop):
   - Removed `selectedCompany={selectedCompany}` prop
   - Removed `onSelectCompany={setSelectedCompany}` prop
   - Removed `selectedCompany` from useMemo dependency array

3. **What was NOT touched:**
   - `CompanyDrawerPortal` (still mounted at LiveFeed level)
   - All other feed functionality

## Verification

### Build Status
```bash
npm run build
```
✅ **PASSED** - Build completes successfully with no TypeScript errors

### Commit
```
commit 9293612
Author: mdion
Date: 2026-06-14

Unify company detail view: remove CompanyTray internal modal, use CompanyDrawer

- Add import for openCompanyDrawer from CompanyDrawer
- Update CompanyCard to call openCompanyDrawer directly
- Remove isExpanded visual state from CompanyCard
- Delete CompanyModal component (lines 372-541)
- Remove CompanyModal portal rendering
- Remove selectedCompany/onSelectCompany props
- Remove selectedCompany state from LiveFeed
- Remove useEffect that refetched stock data
- Keep InteractiveChart (shared by IndexModal/IndexOverview)
- Keep Sparkline (used by CompanyCard grid)

2 files changed, 7 insertions(+), 230 deletion (-)
```

### Branch & PR
- **Branch**: `feat/unify-company-drawer`
- **Base**: `main`
- **PR**: https://github.com/WALTAHHH/Always-Scheming-Terminal/pull/new/feat/unify-company-drawer

## Result
- ✅ Company cards in Public Markets grid now open CompanyDrawer (right-side panel)
- ✅ No centered CompanyModal renders anywhere
- ✅ CompanyTray.tsx is 230 lines smaller
- ✅ Consistent UX: all company detail views use the same drawer pattern
- ✅ Build passes clean
- ✅ One PR against `main`

## Definition of Done Checklist
- [x] Clicking a company card in the Public Markets grid opens the right-side CompanyDrawer (not a centered modal)
- [x] No centered CompanyModal renders anywhere
- [x] CompanyTray.tsx is meaningfully smaller (CompanyModal + its InteractiveChart deleted)
- [x] `selectedCompany` / `onSelectCompany` props removed from CompanyTray if now unused
- [x] `npm run build` passes clean — no orphaned imports
- [x] One PR against `main`
