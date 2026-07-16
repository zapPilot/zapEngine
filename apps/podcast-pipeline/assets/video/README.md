# Podcast video renderer assets

These files are deterministic runtime inputs for the static slide renderer.
Per-episode editorial images do not belong here; they are referenced by a
versioned manifest and stored in immutable object storage.

- `brand/zap-pilot-logo.svg`: Zap Pilot project artwork.
- `fonts/NotoSansCJKtc-Regular.otf` and `fonts/NotoSansCJKtc-Bold.otf`: Noto
  Sans CJK Traditional Chinese, SIL Open Font License 1.1.
- `fonts/JetBrainsMono-SemiBold.ttf`: JetBrains Mono, SIL Open Font License 1.1.
- `maps/us-states-cc0.svg`: “Blank US Map (states only)” by Wikimedia Commons
  user Heitordp, released under CC0. Source:
  https://commons.wikimedia.org/wiki/File:Blank_US_Map_(states_only).svg

The U.S. map is a reusable boundary base. A manifest selects state class names
to highlight; the renderer never uses the copyrighted PJM raster map.
