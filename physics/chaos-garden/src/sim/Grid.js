/** Dimensions and index math. Lx : Ly : Lz = 2 : 1 : H. hx = hy; hz = H/Nz (anisotropic in z). */
export class Grid {
  constructor(Nx, Ny, Nz, H) {
    this.Nx = Nx; this.Ny = Ny; this.Nz = Nz; this.H = H;
    this.Lx = 2; this.Ly = 1; this.Lz = H;
    this.hx = this.Lx / Nx; this.hy = this.Ly / Ny; this.hz = this.Lz / Nz;
    this.N = Nx * Ny * Nz; this.sy = Nx; this.sz = Nx * Ny;
    this.quasi2D = H * Ny < 4;
  }
  idx(i, j, k) { return i + this.Nx * (j + this.Ny * k); }
  /** Confinement wavenumber k_h = π/Lz */
  get kh() { return Math.PI / this.Lz; }
  static forTier(tierDef, H) {
    const [Nx, Ny, NzMax] = tierDef.grid;
    const Nz = Math.min(NzMax, Math.max(4, Math.round(H * Ny)));
    return new Grid(Nx, Ny, Nz, H);
  }
  /** Power-of-two analysis subdomain excluding inlet/outlet buffer strips. */
  analysisWindow() {
    const pow2 = (n) => 1 << Math.floor(Math.log2(n));
    const nx = pow2(Math.floor(this.Nx * 0.75)), ny = pow2(this.Ny);
    return { i0: Math.floor((this.Nx - nx) / 2), j0: Math.floor((this.Ny - ny) / 2), nx, ny };
  }
}