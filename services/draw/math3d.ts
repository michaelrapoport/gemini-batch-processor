
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Vector3 Operations Class
 */
export class Vec3 {
  constructor(public x: number, public y: number, public z: number) {}

  static from(p: Point3D) { return new Vec3(p.x, p.y, p.z); }
  
  add(v: Vec3) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v: Vec3) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  scale(s: number) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  
  dot(v: Vec3) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  
  cross(v: Vec3) {
    return new Vec3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }
  
  normalize() {
    const len = Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
    if (len === 0) return new Vec3(0,0,0);
    return new Vec3(this.x/len, this.y/len, this.z/len);
  }

  // Rotates vector around X axis
  rotateX(theta: number) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return new Vec3(
      this.x,
      this.y * c - this.z * s,
      this.y * s + this.z * c
    );
  }

  // Rotates vector around Y axis
  rotateY(theta: number) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return new Vec3(
      this.x * c + this.z * s,
      this.y,
      -this.x * s + this.z * c
    );
  }

  // Rotates vector around Z axis
  rotateZ(theta: number) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return new Vec3(
      this.x * c - this.y * s,
      this.x * s + this.y * c,
      this.z
    );
  }
}

/**
 * Isometric Projection
 * Standard Engineering Isometric:
 * X axis: -30 deg
 * Y axis: +90 deg (Vertical)
 * Z axis: +30 deg
 * 
 * We use a standard Matrix-based approach here for the "Camera"
 */
export const projectPoint = (v: Vec3, cx: number, cy: number, scale: number = 1): Point2D => {
  // Isometric Matrix (approximate)
  // x' = (x - z) * cos(30)
  // y' = (x + z) * sin(30) - y
  
  const COS_30 = 0.866;
  const SIN_30 = 0.5;
  
  // Apply projection
  const isoX = (v.x - v.z) * COS_30;
  const isoY = (v.x + v.z) * SIN_30 - v.y; // -y because SVG y goes down
  
  return {
    x: cx + isoX * scale,
    y: cy + isoY * scale
  };
};

/**
 * Calculates a Cubic Bezier point at t [0..1]
 */
export const bezier3 = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt * mt * mt;
  const t2 = t * t;
  const t3 = t * t * t;
  
  return new Vec3(
    p0.x * mt3 + 3 * p1.x * mt2 * t + 3 * p2.x * mt * t2 + p3.x * t3,
    p0.y * mt3 + 3 * p1.y * mt2 * t + 3 * p2.y * mt * t2 + p3.y * t3,
    p0.z * mt3 + 3 * p1.z * mt2 * t + 3 * p2.z * mt * t2 + p3.z * t3
  );
};
