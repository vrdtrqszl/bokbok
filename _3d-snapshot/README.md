# Main Page 3D Environment — Snapshot

Saved snapshot of the BokBok main page's 3D environment system at the time
the user requested a backup. Restoring these files reverts the home-page 3D
scene + creature rendering to this exact state.

## Files

| File | Original location | Role |
|------|-------------------|------|
| `page.tsx` | `app/page.tsx` | Home page — hosts `MainViewport`, the search box, the right viewport (`CreatureCanvas`), and the info panel (name / date / journal / Edit / Delete). Owns `selected`, `query`, `focusTarget`, `viewportZoom` state. |
| `MainViewport.tsx` | `app/_components/MainViewport.tsx` | R3F `<Canvas>` wrapper. Contains `ControlsBridge` (OrbitControls + camera-focus animation via `useFrame` lerp), gizmo (x/y/z axis-snap buttons), and tools (hand/pan toggle, zoom-in, zoom-out). |
| `EcosystemCreatures.tsx` | `app/_components/EcosystemCreatures.tsx` | Loads creatures from localStorage, lays them in a circle, renders each as a `<Billboard>` group of textured `<mesh>` planes. Per-creature breathing/sway animation (whole body moves together, blocks stay locked relative to each other). Click + hover handlers, search-query filter. |

## Key behaviors captured in this snapshot

- **Camera focus animation** — `FocusTarget = { position, ts }` triggers a smooth lerp of camera + target via a useFrame loop in `ControlsBridge` (factor 0.12, settles when within 0.005).
- **Click-to-select** in 3D — `Billboard onClick` raycasts hit, calls `onSelect(creature)`. Hovered/selected creatures get a subtle scale bump (1.08 / 1.15).
- **Connected-body motion** — `EnergyBlock` is static (no per-block useFrame). `EnergyCreature` animates the whole group: y-bob, x-drift, z-roll, breath pulse — synchronized so blocks stay locked together.
- **Search-Enter focus** — main `page.tsx` `focusOnQuery()` matches by `matchesCreatureQuery`, computes the target's world position from its index in the circular layout, and bumps `focusTarget.ts` to retrigger the camera animation.
- **Viewport zoom** — `CreatureCanvas` gets a `zoom` multiplier (clamped 0.4–3); the right-panel preview has `<ViewportZoomControls>` (Figma 2084:88 / 2084:85) that increments by 1.2×.

## Restore

```bash
cp _3d-snapshot/MainViewport.tsx       app/_components/MainViewport.tsx
cp _3d-snapshot/EcosystemCreatures.tsx app/_components/EcosystemCreatures.tsx
cp _3d-snapshot/page.tsx               app/page.tsx
```

## Dependencies (do not remove)

- `@react-three/fiber` — Canvas, useFrame, useLoader
- `@react-three/drei` — `<Billboard>`, `<OrbitControls>`
- `three` — `MOUSE`, `Vector3`, `TextureLoader`, `Group`
- `lib/ecosystem.ts` — `loadEcosystem`, `matchesCreatureQuery`
- `lib/creature.ts` — `CreatureSpec`, `CreatureBlock`
- `lib/emotions.ts` — `EMOTION_LIST` (used to preload all 31 textures)
- `app/_components/CreatureCanvas.tsx` — right-panel 2D preview (zoom-aware)
- `app/_components/ViewportZoomControls.tsx` — right-panel zoom buttons
- `public/assets/main-box.svg`, `creature-view.svg`, `info-vector1.svg`, `info-vector2.svg`, `vector-search.svg`, `magnifier.svg`, `edit-button.svg`, `delete-vector.svg`, `login.svg`, `gizmo-v4..v12.svg`, `hand.svg`, `zoom-in.svg`, `zoom-out.svg`, `viewport-zoom-in.svg`, `viewport-zoom-out.svg`
