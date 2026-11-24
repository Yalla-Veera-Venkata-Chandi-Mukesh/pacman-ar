/* pac-story: the ~30 second "Escape from the Poster" sequence.
 *
 * Coordinates (poster space, set by MindAR):
 *   poster centre = (0,0,0), poster width = 1, height = 1.414, +Z = out of the poster toward the viewer.
 *
 * Scenes
 *   1 (0-5s)   poster glows, portal lights up, Pac-Man peels off the poster and jumps out
 *   2 (5-12s)  pellets appear on a 3D curve, Pac-Man eats them (waka + score)
 *   3 (12-18s) the four ghosts peel off the poster, spot Pac-Man and chase him
 *   4 (18-22s) Pac-Man eats the power pellet, glows blue, ghosts turn blue and flee
 *   5 (22-32s) Pac-Man eats every ghost, the portal opens, he celebrates and jumps back in, HIGH SCORE
 *
 * Built as async steps (like coroutines) driven by A-Frame's tick, so everything stays in sync.
 */
(function () {
  const THREE = AFRAME.THREE;
  const PAC = window.PAC;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const RATIO = 4961 / 3508; // poster height / width
  const posterXY = (fx, fy) => [fx - 0.5, (0.5 - fy) * RATIO]; // poster image fraction -> poster space

  // Where the characters are printed on the poster (from tools/make_poster.py)
  const PAC_PRINT = { pos: V(0, (0.5 - 0.53) * RATIO, 0.006), r: 560 / 3508 };
  const PORTAL_POS = V(0, (0.5 - 0.53) * RATIO, 0.004);
  const GHOSTS = [
    { key: 'blinky', fx: 0.19, fy: 0.30, s: 300, tilt: -12, delay: 0.45, flee: V(-0.78, 0.55, 0.3) },
    { key: 'pinky', fx: 0.83, fy: 0.36, s: 260, tilt: 9, delay: 0.75, flee: V(0.8, 0.62, 0.25) },
    { key: 'inky', fx: 0.15, fy: 0.74, s: 280, tilt: 6, delay: 1.05, flee: V(-0.8, -0.62, 0.38) },
    { key: 'clyde', fx: 0.80, fy: 0.77, s: 320, tilt: -8, delay: 1.35, flee: V(0.78, -0.66, 0.3) },
  ];
  const PAC_R = 0.1;      // Pac-Man radius once he's in the room
  const GHOST_S = 0.08;   // ghost half-width once in the room
  const GHOST_POINTS = [200, 400, 800, 1600];

  // Paths through the room (in front of / around the poster, different depths)
  const PATH_PELLETS = new THREE.CatmullRomCurve3([
    V(0, -0.02, 0.32), V(0.3, -0.12, 0.38), V(0.6, 0.1, 0.42), V(0.62, 0.42, 0.3), V(0.35, 0.62, 0.22),
    V(0, 0.55, 0.4), V(-0.35, 0.62, 0.45), V(-0.62, 0.4, 0.3), V(-0.6, 0.05, 0.22),
  ]);
  const PATH_CHASE = new THREE.CatmullRomCurve3([
    V(-0.6, 0.05, 0.22), V(-0.55, -0.35, 0.35), V(-0.2, -0.62, 0.45), V(0.25, -0.6, 0.35),
    V(0.6, -0.4, 0.3), V(0.7, -0.05, 0.4), V(0.45, 0.2, 0.5),
  ]);
  const POWER_POS = V(0.08, 0.3, 0.45);

  // easing
  const linear = (t) => t;
  const inOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const out = (t) => 1 - Math.pow(1 - t, 3);
  const back = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  const ABORT = Symbol('abort');

  AFRAME.registerComponent('pac-story', {
    init() {
      this.tasks = new Set();
      this.time = 0;
      this.runId = 0;
      this.running = false;
      this.build();
      this.reset();
      this.el.addEventListener('anchor-found', (e) => {
        if (e.detail.first) this.start();
      });
    },

    // ------------------------------------------------------------ scene objects
    build() {
      const root = this.el.object3D;

      this.frame = PAC.makeFrame(1, RATIO);
      this.portal = PAC.makePortal();
      this.portal.position.copy(PORTAL_POS);
      root.add(this.frame, this.portal);

      this.pacHole = PAC.makePacHole();
      this.pacHole.position.set(PAC_PRINT.pos.x, PAC_PRINT.pos.y, 0.003);
      this.pacHole.scale.setScalar(PAC_PRINT.r);
      this.pac = PAC.makePacMan();
      root.add(this.pacHole, this.pac);

      this.ghosts = GHOSTS.map((def) => {
        const [x, y] = posterXY(def.fx, def.fy);
        const print = { pos: V(x, y, 0.006), s: def.s / 3508, tilt: THREE.MathUtils.degToRad(def.tilt) };
        const hole = PAC.makeGhostHole();
        hole.position.set(x, y, 0.003);
        hole.scale.setScalar(print.s);
        hole.rotation.z = print.tilt;
        const obj = PAC.makeGhost(PAC.COLORS[def.key]);
        root.add(hole, obj);
        return { def, print, hole, obj, mode: 'poster', wander: Math.random() * 10 };
      });

      this.power = PAC.makePellet(true);
      this.power.position.copy(POWER_POS);
      root.add(this.power);

      this.scoreEl = this.makeText('SCORE  0', V(0, RATIO / 2 + 0.09, 0.05), '#ffffff', 1.3);
      this.bannerEl = document.createElement('a-entity');
      this.bannerEl.object3D.position.set(0, 0.15, 0.45);
      this.bannerEl.appendChild(this.makeText('HIGH SCORE', V(0, 0.08, 0), '#ffd800', 2.2, false));
      this.bannerScoreEl = this.makeText('0', V(0, -0.1, 0), '#ffffff', 1.6, false);
      this.bannerEl.appendChild(this.bannerScoreEl);
      this.el.appendChild(this.bannerEl);
    },

    makeText(value, pos, color, width, attach = true) {
      const e = document.createElement('a-entity');
      e.setAttribute('text', { value, align: 'center', color, width, font: 'exo2bold', side: 'double' });
      e.object3D.position.copy(pos);
      if (attach) this.el.appendChild(e);
      return e;
    },

    reset() {
      this.tasks.clear();
      PAC.sfx && PAC.sfx.sirenStop();
      this.score = 0;
      this.setScore(0);
      this.scoreEl.object3D.visible = false;
      this.bannerEl.object3D.visible = false;
      this.frame.userData.mat.opacity = 0;

      const p = this.portal.userData;
      p.swirl.scale.setScalar(0.0001);
      p.ring.material.opacity = 0;
      p.glow.material.opacity = 0;
      this.portalSpin = false;

      // Pac-Man: sits exactly on top of his printed self, hidden until he "peels off"
      this.pac.visible = false;
      this.pac.position.copy(PAC_PRINT.pos);
      this.pac.scale.setScalar(PAC_PRINT.r);
      this.pac.rotation.set(0, 0, 0);
      this.pac.userData.setMouth(PAC.POSTER_MOUTH);
      this.pac.userData.aura.visible = false;
      this.pacHole.visible = false;
      this.pacHole.material.opacity = 1;
      this.chomping = false;
      this.pacFace = false;
      this.pacPrev = this.pac.position.clone();
      this.history = [];
      this.recording = false;

      for (const g of this.ghosts) {
        g.mode = 'poster';
        g.obj.visible = false;
        g.obj.userData.reset();
        g.obj.position.copy(g.print.pos);
        g.obj.scale.setScalar(g.print.s);
        g.obj.rotation.set(0, 0, g.print.tilt);
        g.hole.visible = false;
        g.hole.material.opacity = 1;
      }

      if (this.pellets) this.pellets.forEach((pl) => this.el.object3D.remove(pl));
      this.pellets = [];
      this.power.visible = false;
    },

    // ------------------------------------------------------------ tiny task system (coroutine helpers)
    every(fn) { this.tasks.add(fn); },
    wait(sec) {
      return new Promise((res) => {
        let e = 0;
        const f = (dt) => { e += dt; if (e >= sec) { this.tasks.delete(f); res(); } };
        this.tasks.add(f);
      });
    },
    tween(sec, fn, ease = inOut) {
      return new Promise((res) => {
        let e = 0;
        fn(0);
        const f = (dt) => {
          e = Math.min(sec, e + dt);
          fn(ease(e / sec));
          if (e >= sec) { this.tasks.delete(f); res(); }
        };
        this.tasks.add(f);
      });
    },
    moveTo(obj, to, sec, ease = inOut, arc = 0) {
      const from = obj.position.clone();
      return this.tween(sec, (t) => {
        obj.position.lerpVectors(from, to, t);
        obj.position.z += Math.sin(Math.PI * t) * arc;
      }, ease);
    },
    scaleTo(obj, s, sec, ease = inOut) {
      const from = obj.scale.x;
      return this.tween(sec, (t) => obj.scale.setScalar(from + (s - from) * t), ease);
    },
    followCurve(obj, curve, sec, onProgress) {
      return this.tween(sec, (t) => {
        obj.position.copy(curve.getPointAt(t));
        if (onProgress) onProgress(t);
      }, linear);
    },
    chase(hunter, prey, speed) {
      return new Promise((res) => {
        const dir = new THREE.Vector3();
        const f = (dt) => {
          dir.subVectors(prey.position, hunter.position);
          const d = dir.length();
          if (d < 0.04) { this.tasks.delete(f); res(); return; }
          hunter.position.addScaledVector(dir.normalize(), Math.min(d, speed * dt));
        };
        this.tasks.add(f);
      });
    },

    popText(value, pos, color = '#00ffff', width = 0.9) {
      const e = this.makeText(value, pos.clone().add(V(0, 0.06, 0.03)), color, width);
      const y0 = e.object3D.position.y;
      this.tween(1.1, (t) => {
        e.object3D.position.y = y0 + t * 0.15;
        e.setAttribute('text', 'opacity', 1 - t * t);
      }, linear).then(() => e.parentNode && e.parentNode.removeChild(e));
    },

    setScore(v) {
      this.score = v;
      this.scoreEl.setAttribute('text', 'value', 'SCORE  ' + v);
    },
    addScore(n) { this.setScore(this.score + n); },

    // ------------------------------------------------------------ per-frame updates
    tick(t, dtMs) {
      const dt = Math.min(0.05, (dtMs || 16) / 1000);
      this.time += dt;
      for (const f of [...this.tasks]) f(dt);

      // Pac-Man: chomping mouth + face the direction he moves
      const ud = this.pac.userData;
      if (this.chomping) {
        this.chompPhase = (this.chompPhase || 0) + dt * 16;
        ud.setMouth(0.5 + 0.5 * Math.sin(this.chompPhase));
      }
      const mv = this.pac.position.clone().sub(this.pacPrev);
      if (this.pacFace && mv.length() > 0.0006) {
        const left = mv.x < 0;
        const ang = Math.atan2(mv.y, Math.abs(mv.x));
        const tz = THREE.MathUtils.clamp(ang, -1.1, 1.1);
        this.pac.rotation.y = left ? Math.PI : 0;
        this.pac.rotation.z += (tz - this.pac.rotation.z) * Math.min(1, dt * 10);
      }
      this.pacPrev.copy(this.pac.position);
      if (ud.aura.visible) {
        const s = 3.4 + Math.sin(this.time * 12) * 0.5;
        ud.aura.scale.set(s, s, 1);
      }
      if (this.recording) {
        this.history.push({ t: this.time, p: this.pac.position.clone() });
        while (this.history.length && this.history[0].t < this.time - 3) this.history.shift();
      }

      // ghosts
      for (const g of this.ghosts) {
        const o = g.obj, gd = o.userData;
        if (g.mode === 'follow') {
          const target = this.sampleHistory(this.time - g.def.delay);
          if (target) o.position.lerp(target, Math.min(1, dt * 5));
          gd.look(this.pac.position.x - o.position.x, this.pac.position.y - o.position.y);
        } else if (g.mode === 'flee') {
          g.wander += dt;
          const target = g.def.flee.clone().add(V(Math.sin(g.wander * 1.7) * 0.12, Math.cos(g.wander * 1.3) * 0.1, Math.sin(g.wander) * 0.05));
          o.position.lerp(target, Math.min(1, dt * 1.6));
          gd.setFlash(this.flashGhosts && Math.floor(this.time * 6) % 2 === 0);
        } else if (g.mode === 'notice') {
          gd.look(this.pac.position.x - o.position.x, this.pac.position.y - o.position.y);
        }
        if (g.mode !== 'poster' && g.mode !== 'gone') {
          gd.wiggle(dt);
          if (g.mode !== 'eaten') o.position.y += Math.sin(this.time * 6 + g.wander) * 0.0006; // bobbing
        }
      }

      // pellets bob and pulse
      for (const pl of this.pellets) if (pl.visible) pl.userData.glow.material.opacity = 0.6 + 0.4 * Math.sin(this.time * 8 + pl.position.x * 10);
      if (this.power.visible) {
        const s = 1 + 0.18 * Math.sin(this.time * 7);
        this.power.scale.setScalar(s);
      }
      if (this.portalSpin) this.portal.userData.swirl.rotation.z -= dt * 3;
    },

    sampleHistory(tq) {
      const h = this.history;
      if (!h.length) return null;
      for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= tq) return h[i].p;
      return h[0].p;
    },

    // ------------------------------------------------------------ the story
    start() {
      if (this.running) return;
      this.run().catch((e) => { if (e !== ABORT) console.error(e); });
    },
    // Play again: reset, then wait until the poster is scanned again
    // (starts immediately only if the camera is looking at the poster right now).
    restart() {
      this.runId++;
      this.running = false;
      this.reset();
      const anchor = this.el.components['sticky-anchor'];
      if (anchor && anchor.rearm()) this.start();
      else this.el.emit('story-waiting');
    },

    async run() {
      const id = ++this.runId;
      this.running = true;
      const sfx = PAC.sfx;
      const step = async (p) => { await p; if (id !== this.runId) throw ABORT; };
      const pac = this.pac;

      // ================= SCENE 1: the poster comes alive =================
      this.el.emit('story-scene', { n: 1 });
      sfx.startup();
      sfx.activate();
      this.scoreEl.object3D.visible = true;
      const fm = this.frame.userData.mat, pr = this.portal.userData;
      this.tween(0.8, (t) => { fm.opacity = t; pr.ring.material.opacity = t; pr.glow.material.opacity = t * 0.6; });
      await step(this.wait(1.2));
      this.tween(1.0, (t) => { fm.opacity = 1 - 0.6 * t; pr.glow.material.opacity = 0.6 - 0.4 * t; });

      // Pac-Man peels off the poster: starts exactly on his printed self, then lifts out (+Z) and shrinks to room size
      pac.visible = true;
      this.pacHole.visible = true;
      await step(this.tween(0.35, (t) => pac.position.z = 0.006 + t * 0.03)); // tiny "unstick" lift
      sfx.jump();
      const peelFrom = pac.position.clone();
      const peelTo = V(0, -0.02, 0.32);
      this.tween(1.3, (t) => pac.rotation.x = Math.sin(Math.PI * t) * -0.5, inOut); // tilt like he's leaning out
      await step(this.tween(1.3, (t) => {
        pac.position.lerpVectors(peelFrom, peelTo, t);
        pac.position.z += Math.sin(Math.PI * t) * 0.18;     // jump arc toward the viewer
        pac.scale.setScalar(PAC_PRINT.r + (PAC_R - PAC_PRINT.r) * t);
      }, out));
      pac.rotation.x = 0;
      this.chomping = true;
      this.pacFace = true;
      await step(this.wait(0.3));

      // ================= SCENE 2: collecting the pellets =================
      this.el.emit('story-scene', { n: 2 });
      const N = 10;
      for (let i = 0; i < N; i++) {
        const u = 0.08 + (i / (N - 1)) * 0.88;
        const pl = PAC.makePellet(false);
        pl.position.copy(PATH_PELLETS.getPointAt(u));
        pl.userData.u = u;
        pl.scale.setScalar(0.0001);
        this.el.object3D.add(pl);
        this.pellets.push(pl);
        this.scaleTo(pl, 1, 0.3, back);
        sfx.pop();
        await step(this.wait(0.07));
      }
      await step(this.followCurve(pac, PATH_PELLETS, 6.2, (t) => {
        for (const pl of this.pellets) {
          if (pl.visible && t >= pl.userData.u - 0.01) {
            pl.visible = false;
            sfx.waka();
            this.addScore(10);
            this.popText('10', pl.position, '#ffd800', 0.5);
          }
        }
      }));

      // ================= SCENE 3: the ghost chase =================
      this.el.emit('story-scene', { n: 3 });
      this.chomping = false;
      pac.userData.setMouth(0.3);
      this.ghosts.forEach((g, i) => this.emergeGhost(g, i * 0.18));
      await step(this.wait(1.4));
      // they notice Pac-Man...
      for (const g of this.ghosts) { g.mode = 'notice'; this.popText('!', g.obj.position, '#ffffff', 1.2); }
      pac.rotation.y = 0; // Pac-Man turns to look at them
      await step(this.wait(0.7));
      // ...and the chase is on
      sfx.sirenStart(true);
      this.history = [{ t: this.time, p: pac.position.clone() }];
      this.recording = true;
      for (const g of this.ghosts) g.mode = 'follow';
      this.chomping = true;
      // power pellet appears halfway through the chase
      this.wait(2.5).then(() => {
        if (id !== this.runId) return;
        this.power.visible = true;
        this.scaleTo(this.power, 1, 0.4, back);
        sfx.pop();
      });
      await step(this.followCurve(pac, PATH_CHASE, 5.0));

      // ================= SCENE 4: power pellet =================
      this.el.emit('story-scene', { n: 4 });
      await step(this.moveTo(pac, POWER_POS, 0.6, linear));
      this.power.visible = false;
      this.addScore(50);
      sfx.power();
      this.popText('POWER UP!', POWER_POS, '#3d7bff', 1.4);
      pac.userData.aura.visible = true;
      this.recording = false;
      for (const g of this.ghosts) { g.mode = 'flee'; g.obj.userData.setFrightened(true); }
      sfx.sirenStart(false);
      // Pac-Man flashes bigger for a moment
      await step(this.tween(0.5, (t) => pac.scale.setScalar(PAC_R * (1 + 0.35 * Math.sin(Math.PI * t)))));
      await step(this.wait(0.5));

      // ================= SCENE 5: Pac-Man hunts the ghosts =================
      this.el.emit('story-scene', { n: 5 });
      const order = [...this.ghosts];
      for (let i = 0; i < order.length; i++) {
        order.sort((a, b) => (a.mode === 'flee' ? 0 : 1) - (b.mode === 'flee' ? 0 : 1) ||
          a.obj.position.distanceTo(pac.position) - b.obj.position.distanceTo(pac.position));
        const g = order[0];
        if (i === order.length - 1) this.flashGhosts = true; // last ghost flashes: power running out
        await step(this.chase(pac, g.obj, 0.85));
        this.eatGhost(g, GHOST_POINTS[i]);
        this.chomping = false;
        await step(this.wait(0.35)); // classic little freeze when a ghost is eaten
        this.chomping = true;
      }
      this.flashGhosts = false;
      sfx.sirenStop();
      pac.userData.aura.visible = false;

      // portal opens
      sfx.portal();
      this.portalSpin = true;
      this.tween(1.0, (t) => {
        pr.swirl.scale.setScalar(Math.max(0.0001, t));
        pr.ring.material.opacity = t;
        pr.glow.material.opacity = 0.8 * t;
        fm.opacity = 0.4 + 0.6 * t;
      }, out);

      // celebrate in front of the poster
      this.pacFace = false;
      await step(this.moveTo(pac, V(0, 0.05, 0.42), 0.8));
      this.chomping = false;
      pac.rotation.set(0, 0, 0);
      pac.userData.setMouth(0.7);
      for (let k = 0; k < 2; k++) {
        sfx.celebrate();
        const y0 = pac.position.y;
        await step(this.tween(0.32, (t) => pac.position.y = y0 + Math.sin(Math.PI * t) * 0.1, linear));
      }
      await step(this.tween(0.6, (t) => pac.rotation.y = t * Math.PI * 2));
      pac.rotation.y = 0;

      // jump back into the poster
      sfx.jump();
      const backFrom = pac.position.clone();
      await step(this.tween(1.2, (t) => {
        pac.position.lerpVectors(backFrom, PAC_PRINT.pos, t);
        pac.position.z += Math.sin(Math.PI * t) * 0.2;
        pac.scale.setScalar(PAC_R + (PAC_PRINT.r - PAC_R) * t);
        pac.userData.setMouth(0.7 + (PAC.POSTER_MOUTH - 0.7) * t);
      }, inOut));
      // everyone is "back" in the poster: the empty spots fill in again
      await step(this.tween(0.6, (t) => {
        this.pacHole.material.opacity = 1 - t;
        for (const g of this.ghosts) g.hole.material.opacity = 1 - t;
      }));
      pac.visible = false;
      this.pacHole.visible = false;
      for (const g of this.ghosts) g.hole.visible = false;

      // portal closes, HIGH SCORE
      this.tween(0.8, (t) => {
        pr.swirl.scale.setScalar(Math.max(0.0001, 1 - t));
        pr.ring.material.opacity = 1 - t;
        pr.glow.material.opacity = 0.8 * (1 - t);
        fm.opacity = 1 - t;
      }).then(() => { this.portalSpin = false; });
      sfx.victory();
      this.bannerScoreEl.setAttribute('text', 'value', String(this.score));
      this.bannerEl.object3D.visible = true;
      this.bannerEl.object3D.scale.setScalar(0.0001);
      await step(this.tween(0.6, (t) => this.bannerEl.object3D.scale.setScalar(Math.max(0.0001, t)), back));

      this.running = false;
      this.el.emit('story-done', { score: this.score });
    },

    emergeGhost(g, delay) {
      this.wait(delay).then(() => {
        const o = g.obj;
        o.visible = true;
        g.hole.visible = true;
        g.mode = 'emerging';
        const from = o.position.clone();
        const to = V(from.x * 1.15, from.y, 0.25);
        const s0 = g.print.s, r0 = g.print.tilt;
        this.tween(1.1, (t) => {
          o.position.lerpVectors(from, to, t);
          o.position.z += Math.sin(Math.PI * t) * 0.12;
          o.scale.setScalar(s0 + (GHOST_S - s0) * t);
          o.rotation.z = r0 * (1 - t);
          o.rotation.x = Math.sin(Math.PI * t) * 0.5;
        }, out);
      });
    },

    eatGhost(g, points) {
      const sfx = PAC.sfx;
      g.mode = 'eaten';
      g.obj.userData.eyesOnly();
      sfx.eatGhost();
      this.addScore(points);
      this.popText(String(points), g.obj.position, '#00ffff', 1.0);
      // the eyes fly back into the portal
      this.wait(0.35).then(() => {
        sfx.eyes();
        const o = g.obj;
        const s0 = o.scale.x;
        const from = o.position.clone();
        this.tween(0.9, (t) => {
          o.position.lerpVectors(from, PORTAL_POS, t);
          o.scale.setScalar(s0 * (1 - 0.7 * t));
        }).then(() => { o.visible = false; g.mode = 'gone'; });
      });
    },
  });
})();
