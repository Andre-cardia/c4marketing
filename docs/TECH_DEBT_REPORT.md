# Tech Debt Report - C4 Marketing

This report identifies technical debt across the codebase, categorizing issues by type and impact. It serves as a roadmap for refactoring and optimization.

## 1. Executive Summary

- **Overall Health**: Moderate. The project structure is standard for a React/Vite app, but several components show signs of rapid prototyping (hardcoded data, inline styles/SVGs, and repetitive logic).
- **Critical Issues**: None blocking.
- **Top Priority**: Refactor `Services.tsx` and similar large components to improve maintainability and performance.

## 2. Code Debt Inventory

### A. Code Duplication & Complexity

- **`components/Services.tsx`**:
  - **Issue**: High duplication in rendering service cards (Traffic, Landing Page, Website, etc.). Each service block repeats similar JSX structure with minor variations.
  - **Impact**: Hard to maintain. Adding a new service requires copying/pasting extensive blocks of code.
  - **Metrics**: ~240 lines, could be reduced to ~100 with a data-driven approach.
  - **Recommendation**: Create a reusable `<ServiceCard />` component and map over a configuration array.

- **Inline SVGs**:
  - **Issue**: Icons are defined inline within components (e.g., `Services.tsx`).
  - **Impact**: Clutters component code, making business logic harder to read.
  - **Recommendation**: Extract to a separate `icons` module or use a library like `lucide-react` consistently (some are already used).

### B. Architecture Debt

- **Hardcoded Data**:
  - **Issue**: Service details, pricing, and descriptions are hardcoded in components.
  - **Impact**: Content changes require code deploys.
  - **Recommendation**: Move content to a constant file (`config/services.ts`) or fetch from Supabase (if dynamic updates are needed).

- **Global State Management**:
  - **Observation**: Current state reliance on local component state + Prop drilling.
  - **Recommendation**: As the app grows, consider a lightweight store (Zustand/Context) for user session and meaningful global data.

### C. Testing Debt

- **Coverage**:
  - **Status**: Low/Non-existent. No test files observed for core components.
  - **Impact**: High risk of regression during refactoring.
  - **Recommendation**: Setup Vitest/Jest and write unit tests for utility functions and critical components like `Services.tsx` logic.

## 3. Prioritized Remediation Plan

### Quick Wins (Sprint 1)

1. **Refactor `Services.tsx`**: Extract `ServiceCard` component.
2. **Externalize Data**: Move service definitions to `lib/constants.ts`.
3. **Standardize Icons**: Replace inline SVGs with `lucide-react` imports.

### Medium Term

1. **Implement Unit Tests**: Add tests for `ProtectedRoute` and key utilities.
2. **Optimize Images**: Ensure all assets are optimized for web (Next-gen formats).

## 4. ROI Analysis

- **Refactoring `Services.tsx`**:
  - **Effort**: 3 hours.
  - **Benefit**: Reduces file size by 50%, simplifies future service additions/changes purely to data config.
  - **Risk**: Low (visual regression only).
