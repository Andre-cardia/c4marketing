# Component Library

This document describes the key UI components used in the C4 Marketing application.

## Core Components

### `Header.tsx`

The main navigation bar. It includes:

- Role-based menu links.
- User profile dropdown.
- Dark/Light mode toggle.
- Dynamic dropdowns for specialized sections (Agendas/Compromissos).

### `ProtectedRoute.tsx`

A wrapper component that handles authentication and role authorization.

- **Props**: `allowedRoles` (optional array of roles).
- **Behavior**: Redirects to Home if not authenticated or if the user role is not in the allowed list.

### `NoticeCard.tsx`

Used to display system-wide notifications or important updates in the Dashboard.

## Project Management Components

### `KanbanBoardModal.tsx`

A full-featured Kanban board for project tasks.

- Supports drag-and-drop (simulated or real).
- Allows filtering by status.
- Triggers `TaskModal` for detailed task editing.

### `TaskModal.tsx`

Detailed view for a single task.

- Edit title, description, and status.
- Set priority and due dates.
- Show AI feedback and task history.

### `AccessGuideModal.tsx`

Displays collected access information (URLs, credentials, notes) for projects like Hosting or Website management.

## Integration Components

### `BookingModal.tsx`

A wrapper for the Cal.com embed, allowing users to schedule meetings directly within the application.

## Styling System

The application uses **Vanilla CSS**. Styles are organized near the components or in a global `index.css`.

- **Theme Variables**: CSS variables are used for colors, spacing, and typography to support consistent branding and Dark Mode.
- **Glassmorphism**: Many components use `backdrop-filter: blur()` and semi-transparent backgrounds for a premium feel.
