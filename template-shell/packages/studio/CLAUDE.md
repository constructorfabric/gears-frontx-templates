# @gears-frontx/studio

FrontX Studio overlay package for runtime inspection and control of MFE applications.

## Studio Layer

This package is part of the **Studio Layer (L4)** - it provides developer tooling for inspecting and controlling FrontX applications at runtime.

## What This Package Contains

| Export | Description |
|--------|-------------|
| `StudioOverlay` | Main overlay component with collapsible panel |
| `ControlPanel` | Control panel with selectors and toggles |
| `ThemeSelector` | Dropdown selector for theme switching |
| `LanguageSelector` | Dropdown selector for language switching |
| `ApiModeToggle` | Toggle switch for API mode (mock/live) |
| `StudioProvider` | Context provider for studio configuration |

## Components

### ThemeSelector

Dropdown for switching themes. Subscribes to available themes and the current theme, and calls the theme setter on change.

### LanguageSelector

Dropdown for switching languages. Subscribes to available languages and the current language, and calls the language setter on change.

### ApiModeToggle

Toggle switch for switching between mock and live API modes. Uses `useApiMode()` hook to read/write the API mode.

## Key Rules

1. **Developer tooling only** - Studio is for development inspection, not production features
2. **Overlay pattern** - Studio renders as a fixed overlay on top of the application
3. **React-only** - Studio is built with React and depends on `@gears-frontx/react` hooks
4. **No direct state mutation** - All state changes go through registry and hooks
