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

### Avatar Components (`src/components/`)
- `AvatarRenderer` - Main 3D avatar rendering (Ready Player Me–oriented); loaded dynamically via `DynamicAvatarRenderer`.
- `DynamicAvatarRenderer` - Client-only wrapper that renders `AvatarRenderer` with the same props (`modelPath`, `cameraControls`, `playbackAnalyser`, `lipsyncAnimation`, etc.).

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

## Avatar and camera (Ready Player Me)

The avatar stack is **Ready Player Me–oriented**. The camera is set so the **face is centered and zoomed** (not full body): default position `[0, 1.4, 0.8]` with the camera looking at `(0, 1.35, 0)` so the face fills the frame. The head mesh is resolved from the GLB by name (`Wolf3D_Head` or `Head`). You can use local GLBs (e.g. `/assets/avatar.glb`) or **Ready Player Me** GLB URLs (e.g. `https://models.readyplayer.me/AVATAR_ID.glb`). `AvatarRenderer` uses `useGLTF(modelPath)`, which accepts both relative paths and full URLs.

## Lip sync (Oculus LipSync visemes)

Lip sync runs **entirely in the browser**. There is **no external lip-sync service** (no NVIDIA Audio2Face or third-party API).

- **Source:** The same TTS playback stream the user hears is analyzed with a single `AnalyserNode`. The avatar’s mouth morph targets are driven from that playback audio.
- **Visemes:** The renderer uses the **Oculus OVR LipSync** viseme set supported by Ready Player Me: `viseme_sil`, `viseme_PP`, `viseme_FF`, `viseme_TH`, `viseme_DD`, `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR`, `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U`, plus optional `mouthOpen` / `mouthClose` for volume-based fallback. Only morph targets that exist on the loaded GLB are driven; no custom targets are added.
- **LiveCall:** A single playback analyser is created when TTS plays and is passed to the avatar as `playbackAnalyser` with `lipsyncAnimation={true}`.

## Natural movements

The avatar uses **time-based, subtle** movements so it feels more alive. All of these run in the browser; no microphone or external input is used for motion.

- **Blinking:** Time-based schedule (e.g. every 2–5 s). Drives `eyesClosed` and/or `eyeBlinkLeft` / `eyeBlinkRight` (only if present on the mesh). Short blink duration with smooth in/out.
- **Chest breathing:** If the GLB has a skeleton, the renderer looks for bones by name (`Chest`, `Spine`, etc.) and applies a small periodic rotation to simulate breathing. If no matching bones are found, breathing is skipped.
- **Occasional smile:** Every 8–20 s the avatar shows a subtle smile (`mouthSmile` morph) for 1–3 s. Smile is suppressed while the agent is speaking so lip sync stays clear.
- **Eyebrow movement:** Slow, small motion on `browInnerUp`, `browDownLeft`, `browDownRight` (when present), driven by a long-period sine wave.
- **Head and body:** If `Head`, `Neck`, `Chest`, or `Spine` bones exist, the renderer applies very small rotations (nod, tilt, sway) over time. Amplitudes are kept low so the face stays centered and stable for the camera.

Only morph targets and bone names that exist on the loaded GLB are used; nothing is assumed. Lip sync (playback-only) and camera behavior are unchanged.

## Adding animations to an unrigged GLB

If your GLB has no skeleton, the avatar falls back to scaling the whole scene for lip sync. To get proper jaw-based lip sync, add a 5-bone face rig (Root, Head, Jaw, Eye_L, Eye_R) with **@gltf-transform/core**:

```bash
cd apps/web
pnpm rig:animations [input.glb] [output.glb]
# Example (default: public/assets/santi.glb → public/assets/santi-rigged.glb):
pnpm rig:animations
# Or: pnpm rig:animations public/assets/santi.glb public/assets/santi-rigged.glb
```

The script selects “jaw” vertices as the lowest ~25% in Y, **Jaw** (lowest ~25% Y), **Head** (mid/upper face), **Eye_L**/**Eye_R** (top ~35%, split by X). AvatarRenderer drives **morph targets** on the head mesh (Oculus LipSync visemes) for lip sync; the rig is optional for custom GLBs.

**Requirement:** Generate the rigged file before using it if you use a custom unrigged GLB. Ready Player Me GLBs already include the required morph targets.

## Customizing the Avatar

To use a custom 3D model, pass its path or URL to `DynamicAvatarRenderer` via the `modelPath` prop (e.g. local `/assets/avatar.glb` or a Ready Player Me URL). The component uses `useGLTF(modelPath)` and resolves the head mesh by name (`Wolf3D_Head` or `Head`) for lip sync. Only morph targets present on the model are driven.

## Troubleshooting

If you see TypeScript errors about missing Three.js types, ensure:
1. `pnpm install` has been run successfully
2. All dependencies are properly installed
3. TypeScript can find the `@types/three` package

If the 3D canvas doesn't render:
1. Check browser console for errors
2. Ensure WebGL is enabled in your browser
3. Verify Three.js packages are installed correctly

