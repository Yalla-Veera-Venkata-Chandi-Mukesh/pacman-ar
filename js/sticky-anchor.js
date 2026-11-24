/* sticky-anchor: keeps the AR content in place when the poster leaves the camera view.
 *
 * While the poster is tracked  -> content follows the poster (smoothed).
 * When the poster is lost      -> content stays where it was, and the phone's gyroscope
 *                                 rotates it back as you turn the phone, so the characters
 *                                 appear to stay in the room. (Rotation only: walking sideways
 *                                 makes them drift a little — web AR on iPhone can't do more.)
 *
 * Usage: <a-entity sticky-anchor="target: #poster-target"> ...content... </a-entity>
 * Call PAC.enableGyro() from a tap handler (iOS needs permission from a user gesture).
 */
(function () {
  const THREE = AFRAME.THREE;
  const PAC = (window.PAC = window.PAC || {});

  // Phone orientation -> camera quaternion (same maths as three.js DeviceOrientationControls)
  const zee = new THREE.Vector3(0, 0, 1);
  const euler = new THREE.Euler();
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° around X
  function deviceQuaternion(out, alpha, beta, gamma, screenOrient) {
    euler.set(beta, alpha, -gamma, 'YXZ');
    out.setFromEuler(euler);
    out.multiply(q1);
    out.multiply(q0.setFromAxisAngle(zee, -screenOrient));
  }

  const gyro = { ok: false, q: new THREE.Quaternion() };
  function onOrient(e) {
    if (e.alpha == null) return;
    const d = THREE.MathUtils.DEG2RAD;
    const so = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * d;
    deviceQuaternion(gyro.q, e.alpha * d, e.beta * d, e.gamma * d, so);
    gyro.ok = true;
  }

  PAC.enableGyro = async function () {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission(); // iPhone
        if (res !== 'granted') return false;
      }
      window.addEventListener('deviceorientation', onOrient);
      return true;
    } catch (err) {
      console.warn('Gyro not available:', err);
      return false;
    }
  };

  AFRAME.registerComponent('sticky-anchor', {
    schema: { target: { type: 'selector' }, smoothing: { default: 0.5 } },

    init() {
      const o = this.el.object3D;
      o.matrixAutoUpdate = false;
      o.visible = false;
      this.tracking = false;
      this.hasPose = false;
      this.lostMatrix = new THREE.Matrix4();
      this.qLost = new THREE.Quaternion();
      this.tmpQ = new THREE.Quaternion();
      this.tmpM = new THREE.Matrix4();
      this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.scl = new THREE.Vector3();
      this.tPos = new THREE.Vector3(); this.tQuat = new THREE.Quaternion(); this.tScl = new THREE.Vector3();

      const t = this.data.target;
      t.addEventListener('targetFound', () => {
        const first = !this.hasPose;
        this.tracking = true;
        this.hasPose = true;
        // NOTE: MindAR fires targetFound BEFORE it writes the poster matrix (it is still all zeros here),
        // so we only snap to the poster in tick(), once a real matrix has arrived.
        if (first) this.snap = true;
        this.el.emit('anchor-found', { first });
      });
      t.addEventListener('targetLost', () => {
        this.tracking = false;
        this.lostMatrix.copy(o.matrix);
        this.qLost.copy(gyro.q);
        this.gyroAtLost = gyro.ok;
        this.el.emit('anchor-lost');
      });
    },

    // Forget the last poster position and hide everything, so the next play needs a fresh scan.
    // Returns true if the poster is in view right now (so the caller can start straight away).
    rearm() {
      if (this.tracking) return true;
      this.hasPose = false;
      this.el.object3D.visible = false;
      return false;
    },

    tick() {
      const o = this.el.object3D;
      if (this.tracking) {
        const m = this.data.target.object3D.matrix;
        if (m.determinant() === 0) { o.matrixWorldNeedsUpdate = true; return; } // no real pose yet
        m.decompose(this.tPos, this.tQuat, this.tScl);
        if (this.snap) { // first sighting: jump straight onto the poster
          this.snap = false;
          this.pos.copy(this.tPos); this.quat.copy(this.tQuat); this.scl.copy(this.tScl);
        }
        o.visible = true;
        // follow the poster, smoothed to reduce jitter
        const k = this.data.smoothing;
        this.pos.lerp(this.tPos, k);
        this.quat.slerp(this.tQuat, k);
        this.scl.lerp(this.tScl, k);
        o.matrix.compose(this.pos, this.quat, this.scl);
      } else if (this.hasPose && this.gyroAtLost && gyro.ok) {
        // poster out of view: counter-rotate by how much the phone has turned since
        this.tmpQ.copy(gyro.q).invert().multiply(this.qLost);
        this.tmpM.makeRotationFromQuaternion(this.tmpQ);
        o.matrix.multiplyMatrices(this.tmpM, this.lostMatrix);
        o.matrix.decompose(this.pos, this.quat, this.scl); // so re-finding the poster blends smoothly
      }
      o.matrixWorldNeedsUpdate = true;
    },
  });
})();
