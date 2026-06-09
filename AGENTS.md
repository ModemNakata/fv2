# fevid-V2 — Project Guide

## Stack
- **Backend**: actix-web 4 + SeaORM (Postgres)
- **Templates**: Askama 0.16 (server-side, Rust)
- **Sessions**: actix-session (cookie-backed)
- **Auth**: argon2 password hashing
- **Static**: nginx serves `/static/` → `static/` directory

## Dependencies (added with `cargo add`)
| Crate | Purpose |
|-------|---------|
| `actix-web` | HTTP framework |
| `askama` | Server-side templates |
| `sea-orm` | Postgres ORM |
| `actix-session` | Cookie-based session management |
| `argon2` | Password hashing + verification |
| `serde` (derive) | JSON (de)serialization for API handlers |
| `uuid` (v4, serde) | User ID generation |
| `chrono` (serde) | Timestamps |

## Project Layout
```
src/
  main.rs       — actix bootstrap, session middleware, routes
  home.rs       — page handlers + Askama template structs
  auth.rs       — sign-in, sign-up, sign-out handlers
  entity/       — SeaORM models (auto-generated)
    mod.rs
    users.rs    — users table model
templates/
  base.html     — shell: top-bar, sign-in/sign-up dialog, content block
  index.html    — homepage (extends base)
  profile.html  — profile page (extends base)
static/
  css/
    style.css   — global styles (variables, layout, shared components)
    index.css   — homepage-specific (chip bar, video grid)
    profile.css — profile-specific (banner, tabs, video grid)
  fonts/        — self-hosted woff2
  js/
    main.js     — dialog toggle, tab switching, form submission
```
<a name="deps"></a>

## Adding new depedencies
Always use `cargo add` — never edit `Cargo.toml` by hand:
```
cargo add <crate>
cargo add <crate> --features feat1,feat2
```

## Templates (Askama)

### Inheritance
```html
{% extends "base.html" %}
{% block title %}Page Title{% endblock %}
{% block head %}
  <link rel="stylesheet" href="/static/css/page.css">
{% endblock %}
{% block content %}
  <!-- page content -->
{% endblock %}
```

### Adding a new page
1. Create `templates/page.html` extending `base.html`
2. Create `static/css/page.css` (mobile-first)
3. Add a template struct in `src/home.rs`:
   ```rust
   #[derive(Template)]
   #[template(path = "page.html")]
   struct PagePage;
   ```
4. Add a handler function
5. Register the route in `src/main.rs`:
   ```rust
   .service(web::resource("/page").route(web::get().to(home::page)))
   ```

## CSS Conventions

### Mobile-first
Default styles target mobile. Use `min-width` breakpoints to scale up:
```css
/* mobile default */
.foo { padding: 8px; }

@media (min-width: 640px) {
  .foo { padding: 16px; }
}
```

### Breakpoints
| Name | Width | Target |
|------|-------|--------|
| (none) | 0+ | Mobile |
| `sm` | 480px | Large phone |
| `md` | 640px | Tablet |
| `lg` | 768px | Small desktop |
| `xl` | 1024px | Desktop |
| `2xl` | 1400px | Wide |

### CSS Variables (in `:root`)
- `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-hover`
- `--accent` = lime `oklch(0.768 0.233 130.85)`
- `--accent-dim`, `--accent-glow`
- `--text-primary`, `--text-secondary`, `--text-tertiary`
- `--border-color`
- `--shadow-sm`, `--shadow`, `--shadow-lg`

## Phosphor Icons

### Location
`phosphor-icons/SVGs/regular/*.svg` (outlined, stroke-based)
`phosphor-icons/SVGs Flat/regular/*.svg` (filled, solid)

We use **`SVGs/regular/`** (outlined) to match YouTube's icon style.

### How to use
1. Find the icon file, e.g. `phosphor-icons/SVGs/regular/thumbs-up.svg`
2. Copy the `<svg>` content into the template
3. Add `class="icon"` for 24px size, `icon--sm` for 20px, `icon--lg` for 56px
4. The SVGs use `stroke="currentColor"` so they inherit the parent's CSS color

```html
<button class="icon-btn" aria-label="Like">
  <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="none"/>
    <path d="..." fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>
  </svg>
</button>
```

### Available icon weights in `SVGs/`
- `bold` — thickest stroke
- `regular` — default thickness (what we use)
- `light` — thin stroke
- `thin` — very thin stroke
- `fill` — solid filled shapes
- `duotone` — two-tone fill

## Shared Components
- `.video-card`, `.thumbnail`, `.thumb-placeholder`, `.thumb-icon`, `.duration`
- `.video-info`, `.channel-avatar`, `.video-details`, `.video-title`
- `.channel-name`, `.video-meta`
- `.icon-btn` — 40x40 circular button wrapper
- `.avatar` — user avatar circle
- `.chip` — filter chip button

These are defined in `style.css` (global) so they're available on any page.

## Video Player (`static/`)

### Setup
The video player uses **Vidstack** with built-in quality selector.

Packages installed via `bun` in `static/`:
```
bun add vidstack
bun add hls.js                        — HLS playback engine
```

### Build
1. Create a build entry file (`static/build-player.js`):
   ```js
   import { VidstackPlayer, VidstackPlayerLayout } from 'vidstack/global/player';
   window.VidstackPlayer = VidstackPlayer;
   window.VidstackPlayerLayout = VidstackPlayerLayout;
   ```
2. Bundle with bun:
   ```
   cd static && bun build build-player.js --outfile=./js/vidstack.min.js --minify
   ```
3. Copy CSS themes:
   ```
   cp node_modules/vidstack/player/styles/default/theme.css static/css/vidstack-theme.css
   cp node_modules/vidstack/player/styles/default/layouts/video.css static/css/vidstack-layout.css
   ```
4. Clean up `build-player.js`

Produces:
```
static/
  js/
    vidstack.min.js         — bundled + minified (0.40 MB)
  css/
    vidstack-theme.css      — default theme
    vidstack-layout.css     — video layout styles
```

### Usage in templates
```html
<link rel="stylesheet" href="/static/css/vidstack-theme.css">
<link rel="stylesheet" href="/static/css/vidstack-layout.css">

<div id="video-target"></div>

<script src="/static/js/vidstack.min.js"></script>
<script type="module">
  const player = await VidstackPlayer.create({
    target: '#video-target',
    title: '{{ video_title }}',
    src: '{{ source_url }}',
    layout: new VidstackPlayerLayout(),
  });
</script>
```

### Quality Selector
Built into `VidstackPlayerLayout` — no extra plugins needed. When the source is an HLS master playlist (`.m3u8`), it automatically parses variant streams and shows a settings gear with resolution options (e.g. "1080p", "720p", "Auto"). The selection is persisted to `localStorage`.

Manual control via `player.qualities`:
```js
player.qualities.selected = quality;   // switch to specific quality
player.qualities.autoSelect();          // re-enable adaptive
player.qualities.switch = 'next';       // change switch mode
```

### Adding HLS support
1. Store HLS master playlists on S3 (or generate them from multi-resolution MP4s)
2. Point `source_url` in `src/video.rs` to the master `.m3u8` URL
3. Vidstack auto-detects HLS and uses hls.js — quality menu appears automatically
4. For MP4 sources the quality menu is hidden
