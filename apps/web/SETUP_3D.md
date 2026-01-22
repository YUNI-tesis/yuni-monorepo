# 3D Avatar Setup Instructions

## Installation

After setting up the project, install the required dependencies for 3D avatar rendering:

```bash
cd apps/web
pnpm install
```

This will install:
- `three` - Three.js 3D library
- `@react-three/fiber` - React renderer for Three.js
- `@react-three/drei` - Useful helpers for react-three-fiber
- `@types/three` - TypeScript types for Three.js

## Components Structure

### Common Components (`src/components/common/`)
- `Button` - Reusable button with variants (primary, secondary, outline, ghost)
- `TextField` - Text input and textarea with consistent styling
- `Tag` - Tag/pill component for labels
- `Select` - Dropdown select component
- `Card` - Card container component
- `Waveform` - Audio waveform visualization

### Avatar Component (`src/components/Avatar3D.tsx`)
- `Avatar3D` - Main 3D avatar rendering component
- `Avatar3DWithWaveform` - Avatar with integrated waveform display

### Theme (`src/lib/theme.ts`)
- Centralized color scheme and theme utilities
- All colors, spacing, and styling constants

## Usage Example

```tsx
import { Avatar3D } from "@/components/Avatar3D";
import { Button, TextField, Tag, Card } from "@/components/common";

export default function AgentPage() {
  return (
    <Card className="p-6">
      <div className="grid grid-cols-2 gap-6">
        <Avatar3D 
          width="100%" 
          height="500px" 
          showControls={true}
          autoRotate={false}
        />
        <div className="space-y-4">
          <TextField label="Name" placeholder="Avatar 1" />
          <TextField label="Description" multiline rows={3} />
          <div className="flex gap-2">
            <Tag variant="purple">Voz personalizada</Tag>
            <Tag variant="gray">Contexto</Tag>
          </div>
          <div className="flex gap-4">
            <Button variant="primary">Save</Button>
            <Button variant="outline">Cancel</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
```

## Color Scheme

The theme uses the following colors:
- **Background**: `#0E0418`
- **Gradient**: `#BE6ADC` (0%) → `#64C3D7` (100%)
- **Purple**: `#784EAB`
- **Blue Gray**: `#333F55`
- **Gray**: `#868D99`
- **Accent**: `#D365FF`

## Customizing the Avatar

The current `Avatar3D` component uses a basic placeholder avatar built with Three.js primitives. To use a custom 3D model:

1. Place your GLTF/GLB model in `public/models/`
2. Update the `MaleAvatar` component in `Avatar3D.tsx` to use `useGLTF`:

```tsx
function MaleAvatar({ position = [0, 0, 0] }: { position?: [number, number, number] }) {
  const { scene } = useGLTF('/models/male-avatar.glb');
  // ... rest of component
}
```

## Troubleshooting

If you see TypeScript errors about missing Three.js types, ensure:
1. `pnpm install` has been run successfully
2. All dependencies are properly installed
3. TypeScript can find the `@types/three` package

If the 3D canvas doesn't render:
1. Check browser console for errors
2. Ensure WebGL is enabled in your browser
3. Verify Three.js packages are installed correctly

