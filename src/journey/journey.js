// The journey: the boat's progress down the canal, its speed (cruising, or what the viewer asks with W/S), a
// sideways drift the viewer steers with A/D, chapters as the boat reaches them, and the end of each journey.
import { START_Z, END_Z, chapterAt, latBounds, routeX, routeHeading, progressAt } from './route.js';
import { canalSlope } from '../world/layout.js';
import { clamp } from '../lib/math.js';

export class Journey {
  constructor() {
    this.z = START_Z;
    this.speed = 0;
    this.cruise = 1.25; // m/s
    this.target = this.cruise;
    this.thrust = 0;
    this.steer = 0;
    this.lat = 0;
    this.latV = 0;
    this.loop = 0;
    this.chapter = -1;
    this.ended = false;
    this.pose = { x: routeX(START_Z, 0), z: START_Z, heading: routeHeading(START_Z), speed: 0 };
    this.onChapter = null;
    this.onEnd = null;
  }

  get progress() { return progressAt(this.z); }

  get moored() { return this.target === 0; }

  togglePause() { this.target = this.target > 0 ? 0 : this.cruise; }

  // straight to a stretch of the canal, as if the boat had always been there
  jump(z, announce = true) {
    this.z = clamp(z, END_Z + 1, START_Z);
    this.lat = 0;
    this.latV = 0;
    this.ended = false;
    // the chapter is announced on the next step, not here: whoever listens may not be listening yet
    this.chapter = announce ? chapterAt(this.z) - 1 : chapterAt(this.z);
    this.pose.heading = routeHeading(this.z);
    this.place(0);
  }

  // back to the start for the next journey; its first chapter is announced on the first step after this
  reset(loop) {
    this.loop = loop;
    this.jump(START_Z, false);
    this.chapter = -1;
  }

  update(dt) {
    // speed eases toward the cruise or the viewer's thrust
    const want = clamp(this.target + this.thrust * 1.6, 0, 3.2);
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * (want > this.speed ? 0.5 : 0.9)));
    this.z -= (this.speed * dt) / Math.hypot(1, canalSlope(this.z));
    if (this.z <= END_Z) {
      this.z = END_Z;
      if (!this.ended) {
        this.ended = true;
        if (this.onEnd) this.onEnd();
      }
    }
    this.place(dt);
    const c = chapterAt(this.z);
    if (c > this.chapter) {
      this.chapter = c;
      if (this.onChapter) this.onChapter(c);
    }
    return this.pose;
  }

  // the pose at the current z: steering drift, position, heading
  place(dt) {
    // steering: a sideways drift with some inertia, bounded by the banks
    const [lo, hi] = latBounds(this.z);
    this.latV += (this.steer * 0.9 - this.latV) * (1 - Math.exp(-dt * 1.6));
    this.lat += this.latV * dt * (0.5 + this.speed * 0.4);
    // past the limit (the arch narrowing ahead), drawn back in over a second or so rather than clamped
    const over = this.lat - clamp(this.lat, lo, hi);
    if (over) {
      this.lat -= over * (dt > 0 ? 1 - Math.exp(-dt * 4) : 1);
      if (this.latV * over > 0) this.latV *= Math.exp(-dt * 6);
    }
    if (!this.steer) this.lat *= Math.exp(-dt * 0.05);
    const p = this.pose;
    p.x = routeX(this.z, this.lat);
    p.z = this.z;
    // a turn shows in the heading; eased so it never snaps
    const h = routeHeading(this.z) + this.latV * 0.12;
    let dh = h - p.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    p.heading += dh * (dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1);
    p.speed = this.speed;
  }
}
