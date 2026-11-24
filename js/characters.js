/* Pac-Man AR – 2.5D characters built in code ("cardboard cut-outs with a little depth").
 * All shapes are drawn in the X/Y plane facing +Z (toward the viewer) and extruded slightly.
 * Unit sizes: Pac-Man radius = 1, ghost half-width = 1. Scale the object to size it.
 */
(function () {
  const THREE = AFRAME.THREE;
  const PAC = (window.PAC = window.PAC || {});

  PAC.COLORS = {
    pac: 0xffd800,
    blinky: 0xff1a1a,
    pinky: 0xffb8ff,
    inky: 0x00ffff,
    clyde: 0xffb852,
    fright: 0x2121ff,
    flash: 0xffffff,
    pupil: 0x1e32dc,
    hole: 0x05031a,
    pellet: 0xfff07a,
  };

  const DEPTH = 0.3; // thickness relative to unit size
  function extrude(shape) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: DEPTH * 0.35,
      bevelSize: 0.06,
      bevelSegments: 3,
      curveSegments: 32,
    });
    g.translate(0, 0, -DEPTH / 2); // centre the thickness on z = 0
    return g;
  }
  const FRONT_Z = DEPTH / 2 + DEPTH * 0.35 + 0.01; // just in front of the bevelled face

  function toonMat(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, emissive: color, emissiveIntensity: 0.3 });
  }
  function flatMat(color) {
    return new THREE.MeshBasicMaterial({ color });
  }

  // ---------------------------------------------------------------- glow sprite
  let glowTex = null;
  PAC.glowTexture = function () {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
    return glowTex;
  };
  PAC.makeGlow = function (color, size) {
    const m = new THREE.SpriteMaterial({
      map: PAC.glowTexture(), color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  };

  // ---------------------------------------------------------------- Pac-Man
  function pieShape(halfMouth) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, 1, halfMouth, Math.PI * 2 - halfMouth, false);
    s.lineTo(0, 0);
    return s;
  }
  const MOUTH_STEPS = 10;
  const MOUTH_MAX = 0.75; // radians (half-angle) fully open
  let pacGeoms = null;

  PAC.makePacMan = function () {
    if (!pacGeoms) {
      pacGeoms = [];
      for (let i = 0; i <= MOUTH_STEPS; i++) pacGeoms.push(extrude(pieShape(0.02 + (MOUTH_MAX - 0.02) * (i / MOUTH_STEPS))));
    }
    const group = new THREE.Group();
    const body = new THREE.Mesh(pacGeoms[6], toonMat(PAC.COLORS.pac));
    group.add(body);

    // eye on both faces (so it is visible when he turns around)
    const eyeGeo = new THREE.CircleGeometry(0.11, 20);
    const eyeMat = flatMat(0x141414);
    const eyeF = new THREE.Mesh(eyeGeo, eyeMat);
    eyeF.position.set(0.07, 0.53, FRONT_Z);
    eyeF.scale.set(0.9, 1.15, 1);
    const eyeB = eyeF.clone();
    eyeB.position.z = -FRONT_Z;
    eyeB.rotation.y = Math.PI;
    group.add(eyeF, eyeB);

    // blue power-up aura (hidden until he eats the power pellet)
    const aura = PAC.makeGlow(0x3d7bff, 3.6);
    aura.visible = false;
    group.add(aura);

    group.userData = {
      body, aura,
      setMouth(t) { // t: 0 = closed, 1 = fully open
        const i = Math.max(0, Math.min(MOUTH_STEPS, Math.round(t * MOUTH_STEPS)));
        body.geometry = pacGeoms[i];
      },
    };
    return group;
  };
  // mouth value that matches the Pac-Man printed on the poster (35° half-angle)
  PAC.POSTER_MOUTH = (0.61 - 0.02) / (MOUTH_MAX - 0.02);

  // ---------------------------------------------------------------- ghosts
  // Same outline as the poster ghosts: dome centred at (0,0), sides to y=-0.7, bumps down to y=-0.95
  PAC.ghostShape = function (bumps) {
    const s = new THREE.Shape();
    s.moveTo(-1, -0.7);
    s.lineTo(-1, 0);
    s.absarc(0, 0, 1, Math.PI, 0, true);
    s.lineTo(1, -0.7);
    const w = 2 / bumps;
    for (let i = 0; i < bumps; i++) {
      s.absellipse(1 - w / 2 - w * i, -0.7, w / 2, 0.25, 0, Math.PI, true);
    }
    s.lineTo(-1, -0.7);
    return s;
  };
  let ghostGeoms = null;

  PAC.makeGhost = function (color) {
    if (!ghostGeoms) ghostGeoms = [extrude(PAC.ghostShape(4)), extrude(PAC.ghostShape(3))];
    const group = new THREE.Group();
    const bodyMat = toonMat(color);
    const body = new THREE.Mesh(ghostGeoms[0], bodyMat);
    group.add(body);

    // normal eyes (white + blue pupils)
    const eyes = new THREE.Group();
    const whiteGeo = new THREE.CircleGeometry(1, 24);
    const pupilGeo = new THREE.CircleGeometry(0.13, 16);
    const pupils = [];
    for (const ex of [-0.38, 0.38]) {
      const w = new THREE.Mesh(whiteGeo, flatMat(0xffffff));
      w.scale.set(0.25, 0.32, 1);
      w.position.set(ex, 0.15, FRONT_Z);
      const p = new THREE.Mesh(pupilGeo, flatMat(PAC.COLORS.pupil));
      p.position.set(ex, 0.15, FRONT_Z + 0.01);
      p.userData.base = new THREE.Vector2(ex, 0.15);
      pupils.push(p);
      eyes.add(w, p);
    }
    group.add(eyes);

    // frightened face (small pale eyes + zigzag mouth)
    const scared = new THREE.Group();
    const sq = new THREE.PlaneGeometry(0.16, 0.16);
    const scaredMat = flatMat(0xffc8b0);
    for (const ex of [-0.33, 0.33]) {
      const e = new THREE.Mesh(sq, scaredMat);
      e.position.set(ex, 0.2, FRONT_Z);
      scared.add(e);
    }
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.07), scaredMat);
      m.position.set(-0.6 + i * 0.2, -0.32 + (i % 2 ? 0.07 : -0.03), FRONT_Z);
      m.rotation.z = i % 2 ? -0.6 : 0.6;
      scared.add(m);
    }
    scared.visible = false;
    group.add(scared);

    let wiggleT = 0;
    group.userData = {
      body, eyes, scared, color,
      frightened: false,
      wiggle(dt) { // swap skirt shape for a running animation
        wiggleT += dt;
        body.geometry = ghostGeoms[Math.floor(wiggleT / 0.14) % 2];
      },
      look(dx, dy) { // direction in X/Y, roughly -1..1
        const len = Math.hypot(dx, dy) || 1;
        for (const p of pupils) {
          p.position.x = p.userData.base.x + (dx / len) * 0.1;
          p.position.y = p.userData.base.y + (dy / len) * 0.13;
        }
      },
      setFrightened(on) {
        this.frightened = on;
        bodyMat.color.setHex(on ? PAC.COLORS.fright : color);
        bodyMat.emissive.setHex(on ? PAC.COLORS.fright : color);
        eyes.visible = !on;
        scared.visible = on;
      },
      setFlash(white) {
        if (!this.frightened) return;
        const c = white ? PAC.COLORS.flash : PAC.COLORS.fright;
        bodyMat.color.setHex(c);
        bodyMat.emissive.setHex(c);
      },
      eyesOnly() { // after being eaten only the eyes remain
        body.visible = false;
        scared.visible = false;
        eyes.visible = true;
      },
      reset() {
        body.visible = true;
        this.setFrightened(false);
      },
    };
    return group;
  };

  // ---------------------------------------------------------------- holes (empty spots left on the poster)
  PAC.makePacHole = function () {
    return new THREE.Mesh(new THREE.CircleGeometry(1.02, 48), new THREE.MeshBasicMaterial({ color: PAC.COLORS.hole, transparent: true, opacity: 1 }));
  };
  PAC.makeGhostHole = function () {
    const g = new THREE.ShapeGeometry(PAC.ghostShape(4), 24);
    g.scale(1.04, 1.04, 1);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: PAC.COLORS.hole, transparent: true, opacity: 1 }));
  };

  // ---------------------------------------------------------------- pellets
  PAC.makePellet = function (power) {
    const group = new THREE.Group();
    const r = power ? 0.04 : 0.016;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), toonMat(power ? 0xffe9a8 : PAC.COLORS.pellet));
    const glow = PAC.makeGlow(power ? 0xffd27a : 0xffe95a, power ? 0.22 : 0.07);
    group.add(ball, glow);
    group.userData = { ball, glow, power };
    return group;
  };

  // ---------------------------------------------------------------- portal (on the poster, matches the printed ring)
  PAC.makePortal = function () {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.27, 0.3, 64),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    // swirl texture
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.15, '#7df9ff');
    grd.addColorStop(0.6, '#5a1ccf');
    grd.addColorStop(1, '#0b0230');
    g.fillStyle = grd;
    g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 7;
    for (let arm = 0; arm < 5; arm++) {
      g.beginPath();
      for (let t = 0; t < 60; t++) {
        const a = arm * (Math.PI * 2 / 5) + t * 0.1;
        const r = 6 + t * 2;
        const x = 128 + r * Math.cos(a), y = 128 + r * Math.sin(a);
        t ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    const swirl = new THREE.Mesh(
      new THREE.CircleGeometry(0.27, 64),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 1 })
    );
    swirl.position.z = -0.001;
    swirl.scale.setScalar(0.0001);
    const glow = PAC.makeGlow(0x00ffff, 1.0);
    glow.material.opacity = 0;
    group.add(swirl, ring, glow);
    group.userData = { ring, swirl, glow };
    return group;
  };

  // glowing frame around the poster edge
  PAC.makeFrame = function (w, h) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const t = 0.015;
    const bars = [
      [w + t, t, 0, h / 2], [w + t, t, 0, -h / 2],
      [t, h + t, -w / 2, 0], [t, h + t, w / 2, 0],
    ];
    for (const [bw, bh, x, y] of bars) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), mat);
      m.position.set(x, y, 0.002);
      group.add(m);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(bw + 0.05, bh + 0.05), mat);
      glow.position.set(x, y, 0.001);
      group.add(glow);
    }
    group.userData = { mat };
    return group;
  };
})();
