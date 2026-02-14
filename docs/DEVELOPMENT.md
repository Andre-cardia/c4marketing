# Developer Guide

Welcome to the C4 Marketing project! This guide will help you get started with the development environment and understand the coding standards.

## Getting Started

### Prerequisites

- Node.js (Latest stable version)
- npm or yarn
- Supabase account (for local development or staging)

### Installation

1. Clone the repository:

    ```bash
    git clone [repository-url]
    cd [repository-name]
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Set up environment variables:
    Create a `.env` file in the root with:

    ```env
    VITE_SUPABASE_URL=your-supabase-url
    VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
    ```

### Running Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Coding Standards

### 1. TypeScript

- Use functional components with `React.FC`.
- Define interfaces for all component props.
- Avoid using `any`; define specific types even for complex Supabase responses.

### 2. Styling (CSS)

- Stick to Vanilla CSS.
- Use the predefined CSS variables in `index.css` for colors and spacing.
- Follow the "Premium" design aesthetic: use gradients, subtle shadows, and smooth transitions.

### 3. State Management

- Use **Context API** for global state (Auth, Theme, Roles).
- Use local hooks (`useState`, `useEffect`) for component-level state.
- For Supabase data, use the custom hooks or lib functions.

### 4. Database Interactions

- All database calls should go through the `lib/supabase.ts` client.
- Use `supabase.rpc()` for complex queries or data transformations when possible.
- Ensure RLS policies are considered when writing new queries.

## Project Structure

- `/components`: Reusable UI elements.
- `/pages`: Main route components.
- `/lib`: Context providers, Supabase client, and utility functions.
- `/supabase`: Migrations and configurations.
- `/docs`: Technical documentation (where you are now!).

## How to add a new Page

1. Create the component in `/pages`.
2. Add the route in `App.tsx`.
3. If protected, wrap it with `<ProtectedRoute>`.
4. Add a link in the navigation menu (usually `Header.tsx`).
