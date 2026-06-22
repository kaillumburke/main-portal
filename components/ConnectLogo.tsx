export default function ConnectLogo({ height = 22, color = '#111111' }: { height?: number; color?: string }) {
  // viewBox is 460 x 90 — scale to requested height
  const width = (460 / 90) * height

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 460 90"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Connect"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Clip paths for interlocking ring effect */}
      <defs>
        <clipPath id="cl-left">
          <rect x="0" y="0" width="96" height="90" />
        </clipPath>
        <clipPath id="cl-right">
          <rect x="96" y="0" width="200" height="90" />
        </clipPath>
      </defs>

      {/* ── Letters: C ── */}
      <text
        x="0" y="76"
        fontFamily="'Barlow Condensed', 'Oswald', Impact, 'Arial Black', sans-serif"
        fontWeight="900"
        fontSize="82"
        fill={color}
        letterSpacing="-1"
      >C</text>

      {/*
        ── Chain-link "O" ──
        Two vertically-oriented oval rings, interlocked horizontally.
        Left ring  center: (82, 45)  rx=24 ry=33
        Right ring center: (106, 45) rx=24 ry=33
        Overlap ~12px in the middle.

        Layering order for interlocked effect:
          1. Right ring (full, behind)
          2. White mask strip (creates gap in left ring's right side)
          3. Left ring clipped to left half (sits in front of right ring's left side)
          4. Right ring clipped to right half (sits on top, completes the link)
      */}

      {/* Step 1 – full right ring (background layer) */}
      <ellipse cx="106" cy="45" rx="24" ry="33"
        fill="none" stroke={color} strokeWidth="12" />

      {/* Step 2 – white mask to carve gap in left ring's right portion */}
      <rect x="96" y="12" width="22" height="66" fill="white" />

      {/* Step 3 – left ring, full (now right side is masked by white) */}
      <ellipse cx="82" cy="45" rx="24" ry="33"
        fill="none" stroke={color} strokeWidth="12" />

      {/* Step 4 – right ring clipped to right half only (comes in front of left ring) */}
      <ellipse cx="106" cy="45" rx="24" ry="33"
        fill="none" stroke={color} strokeWidth="12"
        clipPath="url(#cl-right)" />

      {/* ── Letters: NNECT ── */}
      <text
        x="136" y="76"
        fontFamily="'Barlow Condensed', 'Oswald', Impact, 'Arial Black', sans-serif"
        fontWeight="900"
        fontSize="82"
        fill={color}
        letterSpacing="-1"
      >NNECT</text>

      {/* ── Registered trademark ® ── */}
      <text
        x="438" y="38"
        fontFamily="'Barlow Condensed', 'Oswald', Impact, 'Arial Black', sans-serif"
        fontWeight="700"
        fontSize="22"
        fill={color}
      >®</text>
    </svg>
  )
}
