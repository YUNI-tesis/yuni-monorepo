# Components & Styling Guide

## Overview

This document describes the component structure, styling system, and 3D avatar implementation for the YUNI platform.

## File Structure

```
apps/web/
├── app/
│   ├── globals.css          # Global styles with YUNI color scheme
│   └── layout.tsx           # Root layout with header
├── src/
│   ├── components/
│   │   ├── common/          # Reusable UI components
│   │   │   ├── Button.tsx
│   │   │   ├── TextField.tsx
│   │   │   ├── Tag.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Waveform.tsx
│   │   │   ├── AvatarSelector.tsx
│   │   │   ├── VoiceSelector.tsx
│   │   │   └── index.ts
│   │   ├── Avatar3D.tsx     # 3D avatar rendering component
│   │   └── Logo.tsx         # YUNI logo component
│   └── lib/
│       └── theme.ts         # Theme configuration and utilities
```

## Color Scheme

### Primary Colors
- **Background**: `#0E0418` (Dark purple/black)
- **Gradient Start**: `#BE6ADC` (Light purple)
- **Gradient End**: `#64C3D7` (Cyan blue)
- **Purple**: `#784EAB`
- **Blue Gray**: `#333F55`
- **Gray**: `#868D99`
- **Accent**: `#D365FF` (Bright purple)

### Usage in CSS
```css
/* Gradient */
background: linear-gradient(180deg, #BE6ADC 0%, #64C3D7 100%);

/* Text Gradient */
.gradient-text {
  background: linear-gradient(180deg, #BE6ADC 0%, #64C3D7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

### Usage in TypeScript
```typescript
import { theme } from "@/lib/theme";

// Access colors
const purple = theme.colors.purple;
const gradient = getGradient("vertical");
```

## Common Components

### Button
```tsx
import { Button } from "@/components/common";

<Button variant="primary" size="md" isLoading={false}>
  Save
</Button>

// Variants: primary, secondary, outline, ghost
// Sizes: sm, md, lg
```

### TextField
```tsx
import { TextField } from "@/components/common";

<TextField
  label="Name"
  placeholder="Avatar 1"
  error="Error message"
  helperText="Helper text"
  multiline={false}
  rows={3}
/>
```

### Tag
```tsx
import { Tag } from "@/components/common";

<Tag variant="purple" size="md" onRemove={() => {}}>
  Voz personalizada
</Tag>

// Variants: purple, gray, accent
// Sizes: sm, md
```

### Card
```tsx
import { Card } from "@/components/common";

<Card variant="bordered" padding="md">
  Content here
</Card>

// Variants: default, bordered
// Padding: none, sm, md, lg
```

### Avatar3D
```tsx
import { Avatar3D, Avatar3DWithWaveform } from "@/components/Avatar3D";

<Avatar3D
  width="100%"
  height="500px"
  showControls={true}
  autoRotate={false}
  animationEnabled={true}
/>

<Avatar3DWithWaveform
  showWaveform={true}
  waveformData={[0.5, 0.7, 0.3, ...]}
/>
```

### AvatarSelector
```tsx
import { AvatarSelector } from "@/components/common";

<AvatarSelector
  selectedAvatarId="1"
  avatars={[
    { id: "1", name: "Avatar 1" },
    { id: "2", name: "Avatar 2" }
  ]}
  onSelect={(id) => console.log(id)}
  showPreview={true}
/>
```

### VoiceSelector
```tsx
import { VoiceSelector } from "@/components/common";

<VoiceSelector
  selectedVoiceId="1"
  voices={[
    { id: "1", name: "Voice 1" },
    { id: "2", name: "Voice 2" }
  ]}
  onSelect={(id) => console.log(id)}
/>
```

### Waveform
```tsx
import { Waveform } from "@/components/common";

<Waveform
  data={[0.5, 0.7, 0.3, ...]}
  autoAnimate={true}
  height={64}
  color="gradient"
/>
```

## Example: Agent Editor with Avatar

```tsx
"use client";

import { useState } from "react";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { TextField } from "@/components/common/TextField";
import { Tag } from "@/components/common/Tag";
import { Avatar3D } from "@/components/Avatar3D";
import { AvatarSelector } from "@/components/common/AvatarSelector";
import { VoiceSelector } from "@/components/common/VoiceSelector";

export function AgentEditorWithAvatar() {
  const [formData, setFormData] = useState({
    name: "Avatar 1",
    description: "Descripcion de este avatar",
    tags: ["Voz personalizada", "Contexto"],
    avatarId: "1",
    voiceId: "1",
  });

  return (
    <Card variant="bordered" padding="lg" className="max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Avatar Display */}
        <div className="space-y-6">
          <Avatar3D
            width="100%"
            height="500px"
            showControls={true}
            autoRotate={false}
            animationEnabled={true}
          />
        </div>

        {/* Right: Form */}
        <div className="space-y-6">
          <TextField
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            multiline
            rows={3}
          />

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag, index) => (
                <Tag
                  key={index}
                  variant="purple"
                  onRemove={() => {
                    setFormData({
                      ...formData,
                      tags: formData.tags.filter((_, i) => i !== index),
                    });
                  }}
                >
                  {tag}
                </Tag>
              ))}
            </div>
          </div>

          <AvatarSelector
            selectedAvatarId={formData.avatarId}
            onSelect={(id) => setFormData({ ...formData, avatarId: id })}
          />

          <VoiceSelector
            selectedVoiceId={formData.voiceId}
            onSelect={(id) => setFormData({ ...formData, voiceId: id })}
          />

          <div className="flex gap-4 pt-4">
            <Button variant="outline" onClick={() => {}}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => {}}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
```

## Styling Guidelines

1. **Always use theme colors** from `@/lib/theme` instead of hardcoding colors
2. **Use the common components** for consistency across the app
3. **Apply gradient classes** using the utility classes: `.gradient-primary`, `.gradient-text`
4. **Use Card component** for content containers with consistent styling
5. **Maintain spacing** using theme spacing values
6. **Follow border radius** guidelines from theme

## Next Steps

1. Install dependencies: `pnpm install` in `apps/web/`
2. Replace placeholder avatar with actual 3D model (GLTF/GLB format)
3. Customize avatar animations based on voice/speech
4. Add more common components as needed
5. Implement context management for avatar configuration

