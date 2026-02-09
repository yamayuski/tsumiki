# Tsumiki

Browser Online Game Editor - A TypeScript monorepo for building 3D game scenes

## Overview

Tsumiki is a comprehensive TypeScript monorepo that provides tools for creating and running 3D game scenes in the browser. It consists of multiple packages for networking, ECS (Entity Component System), rendering, and scene editing.

## Project Structure

### Packages (`packages/`)

- **`@tsumiki/networks`** - WebSocket-based RPC implementation (based on [kataribe](https://github.com/yamayuski/kataribe))
- **`@tsumiki/utsutsu`** - Entity Component System for abstract 3D space (renderer-agnostic)
- **`@tsumiki/ukiyoe`** - Babylon.js-based rendering, input/output, and physics (using @babylonjs/havok)
- **`@tsumiki/builder`** - Build and package entities/properties from editor to runtime format

### Applications (`apps/`)

- **`@tsumiki/editor`** - React-based 3D scene editor (similar to Unity or Unreal Engine)
- **`@tsumiki/runtime`** - 3D scene runtime using built scenes from the editor

## Technologies

- **Package Manager**: pnpm (workspace management)
- **Language**: TypeScript (latest version)
- **Library Build Tool**: tsdown
- **Frontend Build Tool**: Vite
- **Rendering**: Babylon.js
- **Physics**: @babylonjs/havok
- **UI Framework**: React (for editor)

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development

```bash
# Run all packages in development mode
pnpm dev

# Run specific package
pnpm --filter @tsumiki/editor dev
pnpm --filter @tsumiki/runtime dev
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @tsumiki/networks build
```

## Package Dependencies

```
apps/editor → packages/builder → packages/utsutsu
            → packages/ukiyoe  → packages/utsutsu

apps/runtime → packages/ukiyoe → packages/utsutsu
             → packages/utsutsu
```

## License

MIT License - Copyright (c) 2026 Masaru Yamagishi
