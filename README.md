# Pac-Man AR – Escape from the Poster

Web-based marker AR experience (no app install). Scan the poster with a phone browser and the characters escape into the room.

## Tech stack (decided Phase 0)
| Tool | Version | Role |
|---|---|---|
| A-Frame | 1.5.0 (CDN) | 3D scene in the web page |
| MindAR (image tracking) | 1.2.5 (CDN) | Camera + poster image tracking |
| Blender | 4.3 | Models, exported as `.glb` |
| GitHub Pages | – | Free HTTPS hosting (camera needs HTTPS) |

## Folder structure
```
PacManAR/
├── index.html          main AR page
├── css/                styles
├── js/
│   ├── characters.js   2.5D Pac-Man, ghosts, pellets, portal (built in code)
│   ├── sticky-anchor.js keeps characters in place when the poster leaves view (gyro)
│   ├── story.js        the 30 s sequence (5 scenes) + replay
│   └── sfx.js          original synthesized arcade sounds (Web Audio)
├── tools/              poster generator, target compiler, dev server
└── assets/
    ├── models/         .glb models from Blender
    ├── audio/          sound effects (original, synthesized)
    ├── targets/        poster.mind (compiled image target)
    └── images/         poster artwork
```

## Coordinate system (MindAR)
- Poster lies in the X/Y plane, centred at 0,0. Poster width = 1 unit.
- +Z points out of the poster toward the viewer ("escaping").

## Poster + target (Phase 1)
- `python tools/make_poster.py` → `assets/images/poster_print_A3.png` (print) and `assets/targets/poster_target.jpg`
- Compile target: run the dev server, open http://localhost:8000/tools/compile.html → writes `assets/targets/poster.mind`

## Run locally
```
python tools/dev_server.py
```
Open http://localhost:8000 (webcam needed), or http://localhost:8000/?demo=1 to watch the story with no camera. Phones need the HTTPS GitHub Pages link.
