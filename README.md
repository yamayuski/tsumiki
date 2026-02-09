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
# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development

```bash
# Run all packages in development mode (with watch)
pnpm dev

# Run specific package
pnpm --filter @tsumiki/editor dev
pnpm --filter @tsumiki/runtime dev

# Run specific library package
pnpm --filter @tsumiki/networks dev
pnpm --filter @tsumiki/utsutsu dev
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @tsumiki/networks build
pnpm --filter @tsumiki/editor build
```

### Type Checking

```bash
# Type check all packages
pnpm typecheck

# Type check specific package
pnpm --filter @tsumiki/builder typecheck
```

### Running the Applications

#### Editor
```bash
# Development mode (with hot reload)
pnpm --filter @tsumiki/editor dev
# Then open http://localhost:3000
```

#### Runtime
```bash
# Development mode (with hot reload)
pnpm --filter @tsumiki/runtime dev
# Then open http://localhost:3001
```

## Package Dependencies

```
apps/editor → packages/builder → packages/utsutsu
            → packages/ukiyoe  → packages/utsutsu

apps/runtime → packages/ukiyoe → packages/utsutsu
             → packages/utsutsu
```

## Architecture

### Entity Component System (ECS)

The `@tsumiki/utsutsu` package provides a renderer-agnostic ECS implementation:
- **Entities**: Unique identifiable objects in the 3D world
- **Components**: Data containers (Transform, Mesh, Camera, etc.)
- **Systems**: Logic processors that operate on entities with specific components
- **World**: Container and manager for all entities and systems

### Rendering Pipeline

The `@tsumiki/ukiyoe` package wraps Babylon.js to provide:
- 3D rendering with WebGL
- Physics simulation with Havok
- Input management (keyboard, mouse)
- Scene synchronization with ECS World

### Build System

The `@tsumiki/builder` package handles:
- Serialization of ECS entities and components
- Packaging scenes for runtime
- Optimization and bundling of assets

### Network Communication

The `@tsumiki/networks` package provides:
- WebSocket-based RPC communication
- Client-server architecture
- Inspired by [kataribe](https://github.com/yamayuski/kataribe)

## Project Structure Details

### Libraries (packages/)

Each library package uses:
- **tsdown** for building TypeScript to ESM
- Strict TypeScript configuration
- Declaration files (.d.mts) for type safety
- Source maps for debugging

### Applications (apps/)

Each application uses:
- **Vite** for fast development and optimized production builds
- Hot Module Replacement (HMR) in development
- Code splitting and tree shaking in production
- TypeScript with React (for editor)

## License

MIT License - Copyright (c) 2026 Masaru Yamagishi
