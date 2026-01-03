const textures = []
for(let i=0;i<16;i++) {
  textures.push(generateNoiseTexture(64, 64))
}

function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x
}

const noise3da = generateSmoothNoise3D(64, 64, 64, 4, 4, 4)
const noise3db = generateSmoothNoise3D(64, 64, 64, 3, 3, 3)
const noise3dc = generateSmoothNoise3D(64, 64, 64, 2, 2, 2)
const noise2d = generateSmoothNoise(256, 16)

class ShadowMap3D {
  constructor(size) {
    this.size = size
    this.data = [...new Array(size)].map(() => [...new Array(size)].map(() => new Array(size).fill(0)))
  }
  // x, y, z:depth in light space
  addDensity(x, y, z, density) {
    const size = this.size
    x = (x + 1) / 2 * size
    y = (y + 1) / 2 * size
    z = (z + 1) / 2 * size
    if (x < 0 || y < 0 || z < 0 || x >= size - 1.01 || y >= size - 1.01 || z >= size - 1.01) return
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const iz = Math.floor(z)
    const ax = x - ix
    const ay = y - iy
    const az = z - iz
    const bx = 1 - ax
    const by = 1 - ay
    const bz = 1 - az
    this.data[ix][iy][iz] += density * bx * by * bz
    this.data[ix+1][iy][iz] += density * ax * by * bz
    this.data[ix][iy+1][iz] += density * bx * ay * bz
    this.data[ix+1][iy+1][iz] += density * ax * ay * bz
    this.data[ix][iy][iz+1] += density * bx * by * az
    this.data[ix+1][iy][iz+1] += density * ax * by * az
    this.data[ix][iy+1][iz+1] += density * bx * ay * az
    this.data[ix+1][iy+1][iz+1] += density * ax * ay * az
  }
  clear() {
    this.data.forEach(yzs => yzs.forEach(zs => zs.fill(0)))
  }
  calculateBrightness() {
    const size = this.size
    this.data.forEach(yzs => yzs.forEach(zs => {
      let brightness = 1
      for (let i = 0; i < zs.length; i++) {
        brightness *= Math.max(1 - zs[i] / size, 0)
        zs[i] = brightness
      }
    }))
  }
  brightnessAt(x, y, z) {
    const size = this.size
    x = (x + 1) / 2 * size
    y = (y + 1) / 2 * size
    z = (z + 1) / 2 * size
    if (x < 0) x = 0
    if (y < 0) y = 0
    if (z < 0) z = 0
    if (x > size - 1) x = size - 1
    if (y > size - 1) y = size - 1
    if (z > size - 1) z = size - 1
    return valueAt3D(this.data, x, y, z)
  }
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.width = canvas.width
    this.height = canvas.height
    this.size = Math.min(this.width, this.height)
    this.ctx.translate(this.width / 2, this.height / 2)
    this.ctx.scale(this.size / 2, this.size / 2)
  }
  variant(texture, style) {
    // style: 0: black, 1: accent, 2: white
    this.variantCache = this.variantCache || new Map()
    let variants = this.variantCache.get(texture)
    if (!variants) this.variantCache.set(texture, variants = [])
    if (variants[style]) return variants[style]
    const variant = document.createElement('canvas')
    const ctx = variant.getContext('2d')
    variant.width = texture.width
    variant.height = texture.height
    ctx.drawImage(texture, 0, 0)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = ['#877', '#f60', '#ffe'][style]
    ctx.fillRect(0, 0, variant.width, variant.height)
    variants[style] = variant
    return variant
  }
  renderTexture(p, r, alpha, texture, accentness, brightness) {
    texture = texture || textures[textures.length * Math.random() | 0]
    // p: { x, y, xx, yy, xy } (center and covariance)
    // transform matrix = [[a, c], [c, b]]
    // xx = aa+cc
    // yy = bb+cc
    // xy = ac+bc
    // solve for a, b, c

    // det = xx*yy-xy*xy = (aa+cc)(bb+cc)-(ac+bc)**2 = aabb+cccc-2abcc = (ab-cc)**2
    // trace = xx+yy = aa+bb+2cc
    const trace = p.xx + p.yy
    const det = p.xx * p.yy - p.xy * p.xy
    const a_b = Math.sqrt(trace + 2 * Math.sqrt(det))
    const c = p.xy / a_b
    const a = Math.sqrt(p.xx - c*c)
    const b = Math.sqrt(p.yy - c*c)
    if (isNaN(a) || isNaN(b)) return
    this.ctx.save()
    this.ctx.transform(a, c, c, b, p.x, p.y)

    alpha /= 1 + trace / 10

    // Render two textures: black, color with alpha: a1, a2
    // Solves this equation:
    //   (dst * (1-a1) + a1*black)*(1-a2) + a2*color = dst * (1 - alpha) + alpha * color
    const a2 = brightness * alpha
    const a1 = a2 == 1 ? 0 : alpha * (1 - brightness) / (1 - a2)
    this.ctx.globalAlpha = a1
    this.ctx.drawImage(this.variant(texture, 0), -r, -r, 2*r, 2*r)

    // Render color with two textures: accent, white, alpha: aa, aw
    // Solves this equation:
    //   (dst * (1-aa) + aa * accent) * (1-aw) + aw * white = dst * (1 - alpha) + alpha * (accent * accentness + (1 - accentness) * white)
    const aw = (1 - accentness) * a2
    const aa = aw == 1 ? 0 : 1 - (1 - a2) / (1 - aw)
    this.ctx.globalAlpha = aa
    this.ctx.drawImage(this.variant(texture, 1), -r, -r, 2*r, 2*r)
    this.ctx.globalAlpha = aw
    this.ctx.drawImage(this.variant(texture, 2), -r, -r, 2*r, 2*r)
    this.ctx.restore()
  }

  renderTriangle(p0, p1, p2, c0, c1, c2) {
    const cx = (p0.x + p1.x + p2.x) / 3
    const cy = (p0.y + p1.y + p2.y) / 3
    const offset = 1 / this.size
    this.ctx.beginPath()
    const l1 = Math.hypot(p0.x - cx, p0.y - cy)
    const l2 = Math.hypot(p1.x - cx, p1.y - cy)
    const l3 = Math.hypot(p2.x - cx, p2.y - cy)
    this.ctx.moveTo(p0.x + (p0.x - cx) * offset / l1, p0.y + (p0.y - cy) * offset / l1)
    this.ctx.lineTo(p1.x + (p1.x - cx) * offset / l2, p1.y + (p1.y - cy) * offset / l2)
    this.ctx.lineTo(p2.x + (p2.x - cx) * offset / l3, p2.y + (p2.y - cy) * offset / l3)
    this.ctx.closePath()
    // color: p1 -> c1, p2 -> c2, p3 -> c3
    const m00 = p1.x - p0.x
    const m01 = p1.y - p0.y
    const m10 = p2.x - p0.x
    const m11 = p2.y - p0.y
    const mdet = (m00 * m11 - m01 * m10)

    let vecx = 0, vecy = 0
    for (let col = 0; col < 3; col++) {
      const v0 = c1[col] - c0[col]
      const v1 = c2[col] - c0[col]
      vecx += (m11 * v0 - m01 * v1) / mdet
      vecy += (-m10 * v0 + m00 * v1) / mdet
    }
    const veclen = Math.hypot(vecx, vecy)
    vecx /= veclen
    vecy /= veclen
    const dot0 = p0.x * vecx + p0.y * vecy
    const dot1 = p1.x * vecx + p1.y * vecy
    const dot2 = p2.x * vecx + p2.y * vecy
    const dotmin = Math.min(dot0, dot1, dot2)
    const dotmax = Math.max(dot0, dot1, dot2)
    this.ctx.fillStyle = 'black'
    const gradient = this.ctx.createLinearGradient(
      dotmin * vecx, dotmin * vecy,
      dotmax * vecx, dotmax * vecy
    )
    // minimize vertex color difference with least squares
    // p0color = (cmin*(dotmax - dot0) + (dot0 - dotmin) * cmax) / (dotmax - dotmin)
    // p2color = (cmin*(dotmax - dot1) + (dot1 - dotmin) * cmax) / (dotmax - dotmin)
    // p1color = (cmin*(dotmax - dot2) + (dot2 - dotmin) * cmax) / (dotmax - dotmin)
    // (cmin*(dotmax - dot0) + (dot0 - dotmin) * cmax - (dotmax - dotmin)*c0)**2
    // 2*cmin*(dotmax - dot0)**2 + (dotmax-dot)(dot0-dotmin)*cmax
    const n00 = (dotmax - dot0)**2 + (dotmax - dot1)**2 + (dotmax - dot2)**2
    const n01 = (dot0 - dotmin)*(dotmax - dot0) + (dot1 - dotmin)*(dotmax - dot1) + (dot2 - dotmin)*(dotmax - dot2)
    const n10 = n01
    const n11 = (dot0 - dotmin)**2 + (dot1 - dotmin)**2 + (dot2 - dotmin)**2
    const det = n00 * n11 - n01 * n10
    const cmin = [
      (dotmax - dotmin) * (n11 * (c0[0] * (dotmax - dot0) + c1[0] * (dotmax - dot1) + c2[0] * (dotmax - dot2)) - n01 * (c0[0] * (dot0 - dotmin) + c1[0] * (dot1 - dotmin) + c2[0] * (dot2 - dotmin))) / det,
      (dotmax - dotmin) * (n11 * (c0[1] * (dotmax - dot0) + c1[1] * (dotmax - dot1) + c2[1] * (dotmax - dot2)) - n01 * (c0[1] * (dot0 - dotmin) + c1[1] * (dot1 - dotmin) + c2[1] * (dot2 - dotmin))) / det,
      (dotmax - dotmin) * (n11 * (c0[2] * (dotmax - dot0) + c1[2] * (dotmax - dot1) + c2[2] * (dotmax - dot2)) - n01 * (c0[2] * (dot0 - dotmin) + c1[2] * (dot1 - dotmin) + c2[2] * (dot2 - dotmin))) / det,
    ]
    const cmax = [
      (dotmax - dotmin) * (-n10 * (c0[0] * (dotmax - dot0) + c1[0] * (dotmax - dot1) + c2[0] * (dotmax - dot2)) + n00 * (c0[0] * (dot0 - dotmin) + c1[0] * (dot1 - dotmin) + c2[0] * (dot2 - dotmin))) / det,
      (dotmax - dotmin) * (-n10 * (c0[1] * (dotmax - dot0) + c1[1] * (dotmax - dot1) + c2[1] * (dotmax - dot2)) + n00 * (c0[1] * (dot0 - dotmin) + c1[1] * (dot1 - dotmin) + c2[1] * (dot2 - dotmin))) / det,
      (dotmax - dotmin) * (-n10 * (c0[2] * (dotmax - dot0) + c1[2] * (dotmax - dot1) + c2[2] * (dotmax - dot2)) + n00 * (c0[2] * (dot0 - dotmin) + c1[2] * (dot1 - dotmin) + c2[2] * (dot2 - dotmin))) / det,
    ]
    gradient.addColorStop(0, `#${num2hex(clamp(cmin[0], 0, 255))}${num2hex(clamp(cmin[1], 0, 255))}${num2hex(clamp(cmin[2], 0, 255))}`)
    gradient.addColorStop(1, `#${num2hex(clamp(cmax[0], 0, 255))}${num2hex(clamp(cmax[1], 0, 255))}${num2hex(clamp(cmax[2], 0, 255))}`)
    this.ctx.fillStyle = gradient
    this.ctx.fill()
  }
  clear() {
    this.ctx.clearRect(-1, -1, 2, 2)
  }
}
const shadow = new ShadowMap3D(64)
const canvas = document.createElement('canvas')
canvas.style.display = 'block'
canvas.width = canvas.height = 800
document.body.appendChild(canvas)
const renderer = new Renderer(canvas)

const particles = []
function addParticle(x, y, z) {
  particles.push({ x, y, z, xx: 1, yy: 1, zz: 1, xy: 0, yz: 0, zx: 0 })
}
for (let i = 0; i < 8000; i++) {
  let x = 0
  let y = 0
  for (let j = 0; j < 10; j++) {
    x = -0.6 + 1.2 * Math.random()
    y = -0.6 + 1.2 * Math.random()
    if (Math.random() < 100 * valueAt(noise2d, x * 256, y * 256)) break
  }
  const z = valueAt(noise2d, 200 * (x + y), 200 * (x - y)) * 10 - 0.05 + 0.1 * Math.random() + valueAt(noise2d, 32 * (x + y), 32 * (x - y)) * 20
  addParticle(x, y, z)
}

for (const [x0, upperN] of [[-0.6, 1000], [0.2, 500]]) {
  const alen = noise3da.length
  const tbasex = alen * Math.random()
  const tbasey = alen * Math.random()
  const tbasez = alen * Math.random()
  for (let i = 0; i < upperN; i++) {
    let t = 2 * i / upperN - 1
    t = Math.asin(t) * 2 / Math.PI
    const r = (1 - t * t) * 0.002
    const x = valueAt3D(noise3da, tbasex + t * noise3da.length / 5, tbasey, tbasez) + (Math.random() - 0.5) * r
    const y = valueAt3D(noise3da, tbasex + t * noise3da.length / 5, tbasey, tbasez + noise3da.length / 3, 17) + (Math.random() - 0.5) * r
    const z = valueAt3D(noise3da, tbasex + t * noise3da.length / 5, tbasey, tbasez + noise3da.length * 2 / 3, 37) + (Math.random() - 0.5) * r
    addParticle(x0 + 20 * y, t / 4 + 20 * x, 20 * z + 0.6)
  }
}
const initialPosition = particles.map(p => ({ x: p.x, y: p.y, z: p.z }))
const particlePhase = particles.map(() => Math.random())

const mouse = { x: 0, y: 0 }
const eventHandler = (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = 2 * (e.clientX - rect.left) / rect.width - 1
  const y = 2 * (e.clientY - rect.top) / rect.height - 1
  mouse.x = Math.min(Math.max(-0.9, x), 0.9)
  mouse.y = Math.min(Math.max(-0.9, y), 0.9)
}
document.addEventListener('pointermove', eventHandler)
document.addEventListener('pointerdown', eventHandler)

let time = 0
function Velocity(x, y, z) {
  // let vx = 0
  // let vy = z / (0.5 + r) / 2 / r
  // let vz = -y / (0.5 + r) / 2 / r
  let vx = (1 + z) ** 2 / 2, vy = 0, vz = 0
  let tx, ty, tz
  tx = x * 4 + 0.05 * time
  ty = y * 32 + 0.1 * time
  tz = z * 32
  vx += valueAt3D(noise3dc, tx, ty, tz) * 20
  vy += valueAt3D(noise3dc, tx, ty, tz + 10) * 20
  vz += valueAt3D(noise3dc, tx, ty, tz + 20) * 2
  tx = x * 4 - 0.1 * time
  ty = y * 32 + 0.05 * time
  tz = z * 32 + 3
  vx += valueAt3D(noise3dc, tx, ty, tz) * 20
  vy += valueAt3D(noise3dc, tx, ty, tz + 10) * 20
  vz += valueAt3D(noise3dc, tx, ty, tz + 20) * 2
  tx = x * 4 + 0.1 * time
  ty = y * 32 - 0.1 * time
  tz = z * 32 + 6
  vx += valueAt3D(noise3dc, tx, ty, tz) * 20
  vy += valueAt3D(noise3dc, tx, ty, tz + 10) * 20
  vz += valueAt3D(noise3dc, tx, ty, tz + 20) * 2
  return { x: vx, y: vy, z: vz }
}

function normalizeParticle(p) {
  // Assume non-divergent field. det should be 1.
  const det = p.xx * p.yy * p.zz + 2 * p.xy * p.yz * p.zx - p.xx * p.yz * p.yz - p.yy * p.zx * p.zx - p.zz * p.xy * p.xy
  if (det < 0) return
  const scale = 1 / Math.cbrt(det)

  p.xx *= scale
  p.yy *= scale
  p.zz *= scale
  p.xy *= scale
  p.yz *= scale
  p.zx *= scale
}

// Normalize level 2. Limit the eccentricity.
function normalizeParticle2(p) {
  normalizeParticle(p)
  const { xx, yy, zz } = p
  const len = xx * xx + yy * yy + zz * zz // long + short
  const threshold = 8
  if (len > threshold) {
    const over = len - threshold
    const add = over / (1 + over) / 10
    p.xx += add
    p.yy += add
    p.zz += add
    normalizeParticle(p)
  }
}

function update() {
  time++
  for (const p of particles) {
    const { x, y, z, xx, yy, zz, xy, yz, zx } = p
    const v = Velocity(x, y, z)
    // grad of v
    const delta = 0.001
    const vscale = 0.001
    const vxp = Velocity(x + delta, y, z)
    const vxm = Velocity(x - delta, y, z)
    const vyp = Velocity(x, y + delta, z)
    const vym = Velocity(x, y - delta, z)
    const vzp = Velocity(x, y, z + delta)
    const vzm = Velocity(x, y, z - delta)
    const fxx = 1 + (vxp.x - vxm.x) / 2 / delta * vscale
    const fyy = 1 + (vyp.y - vym.y) / 2 / delta * vscale
    const fzz = 1 + (vzp.z - vzm.z) / 2 / delta * vscale
    const fxy = (vyp.x - vym.x) / 2 / delta * vscale
    const fxz = (vzp.x - vzm.x) / 2 / delta * vscale
    const fyx = (vxp.y - vxm.y) / 2 / delta * vscale
    const fyz = (vzp.y - vzm.y) / 2 / delta * vscale
    const fzx = (vxp.z - vxm.z) / 2 / delta * vscale
    const fzy = (vyp.z - vym.z) / 2 / delta * vscale
    // Transform:
    // x2 = fxx*x + fxy*y + fxz*z
    // y2 = fyx*x + fyy*y + fyz*z
    // z2 = fzx*x + fzy*y + fzz*z
    // Covariance of x2, y2, z2:
    p.xx = fxx * fxx * xx + fxy * fxy * yy + fxz * fxz * zz +  2 * (fxx * fxy * xy + fxy * fxz * yz + fxz * fxx * zx)
    p.yy = fyx * fyx * xx + fyy * fyy * yy + fyz * fyz * zz +  2 * (fyx * fyy * xy + fyy * fyz * yz + fyz * fyx * zx)
    p.zz = fzx * fzx * xx + fzy * fzy * yy + fzz * fzz * zz +  2 * (fzx * fzy * xy + fzy * fzz * yz + fzz * fzx * zx)
    p.xy = fxx * fyx * xx + fxy * fyy * yy + fxz * fyz * zz + (fxx * fyy + fxy * fyx) * xy + (fxy * fyz + fxz * fyy) * yz + (fxz * fyx + fxx * fyz) * zx
    p.yz = fyx * fzx * xx + fyy * fzy * yy + fyz * fzz * zz + (fyx * fzy + fyy * fzx) * xy + (fyy * fzz + fyz * fzy) * yz + (fyz * fzx + fyx * fzz) * zx
    p.zx = fzx * fxx * xx + fzy * fxy * yy + fzz * fxz * zz + (fzx * fxy + fxx * fxz) * xy + (fzy * fxz + fyy * fzx) * yz + (fzz * fxx + fxz * fzx) * zx
    p.x += vscale * v.x
    p.y += vscale * v.y
    p.z += vscale * v.z
    normalizeParticle2(p)
  }
}

function renderUseXY(p) { return { x: p.x, y: p.y, xx: p.xx, yy: p.yy, xy: p.xy } }
function renderUseXZ(p) { return { x: p.x, y: p.z, xx: p.xx, yy: p.zz, xy: p.zx } }

const projectionDistance = 2
const viewTransformMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
]
const cameraPosition = { x: 0, y: 0, z: 0 }
function viewTransform(p) {
  const [[mxx, mxy, mxz], [myx, myy, myz], [mzx, mzy, mzz]] = viewTransformMatrix
  const { x, y, z, xx, yy, zz, xy, yz, zx } = p
  const viewZ = mzx * x + mzy * y + mzz * z
  const scale = projectionDistance / (projectionDistance + viewZ)
  const covScale = scale * scale
  return {
    x: (mxx * x + mxy * y + mxz * z) * scale,
    y: (myx * x + myy * y + myz * z) * scale,
    z: (mzx * x + mzy * y + mzz * z) * scale,
    xx: (mxx * mxx * xx + mxy * mxy * yy + mxz * mxz * zz + 2 * (mxx * mxy * xy + mxy * mxz * yz + mxz * mxx * zx)) * covScale,
    yy: (myx * myx * xx + myy * myy * yy + myz * myz * zz + 2 * (myx * myy * xy + myy * myz * yz + myz * myx * zx)) * covScale,
    xy: (mxx * myx * xx + mxy * myy * yy + mxz * myz * zz + (mxx * myy + mxy * myx) * xy + (mxy * myz + mxz * myy) * yz + (mxz * myx + mxx * myz) * zx) * covScale
  }
}

function renderSkySphere() {
  const lstep = 100
  const tstep = 100
  const points = []
  // precalculation step
  for(let i = 0; i <= lstep; i++) {
    const l = Math.PI * i / lstep
    const lrow = []
    for (let j = 0; j <= tstep; j++) {
      const t = 2 * Math.PI * j / tstep
      const x = Math.cos(l)
      const y = Math.sin(l) * Math.cos(t)
      const z = Math.sin(l) * Math.sin(t)
      const col = [255 * i / lstep, 255 * j / tstep, 255 * (i + j) / (lstep + tstep)]
      lrow.push({ x, y, z, col })
    }
    points.push(lrow)
  }
  const zmin = projectionDistance / Math.sqrt(2 + projectionDistance**2) - 0.1
  function transform(p) {
    const z = viewTransformMatrix[2][0] * p.x + viewTransformMatrix[2][1] * p.y + viewTransformMatrix[2][2] * p.z
    if (z < zmin) return
    return {
      x: projectionDistance * (viewTransformMatrix[0][0] * p.x + viewTransformMatrix[0][1] * p.y + viewTransformMatrix[0][2] * p.z) / z,
      y: projectionDistance * (viewTransformMatrix[1][0] * p.x + viewTransformMatrix[1][1] * p.y + viewTransformMatrix[1][2] * p.z) / z,
      p
    }
  }
  // render step
  function calculateColor(p) {
    const t = p.z + 0.2 * p.x + 0.4
    const rgb = skyColorGradient(t)
    return rgb
  }

  for(let i = 0; i < lstep; i++) {
    for (let j = 0; j < tstep; j++) {
      const p1 = transform(points[i][j])
      const p2 = transform(points[i+1][j])
      const p3 = transform(points[i+1][j+1])
      const p4 = transform(points[i][j+1])
      if (!p1 || !p2 || !p3 || !p4) continue
      if (!p1.col) p1.col = calculateColor(p1.p)
      if (!p2.col) p2.col = calculateColor(p2.p)
      if (!p3.col) p3.col = calculateColor(p3.p)
      if (!p4.col) p4.col = calculateColor(p4.p)
      if (i != lstep - 1) renderer.renderTriangle(p1, p2, p3, p1.col, p2.col, p3.col)
      if (i != 0) renderer.renderTriangle(p1, p3, p4, p1.col, p3.col, p4.col)
    }
  }
}

function updateViewMatrix() {
  const angleZ = -0.3 * Math.PI * mouse.y
  const angle = -0.5 * Math.PI * mouse.x
  const cz = Math.cos(angleZ)
  const sz = Math.sin(angleZ)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  viewTransformMatrix[0] = [cos, sin, 0]
  viewTransformMatrix[1] = [-sin*sz, cos*sz, -cz]
  viewTransformMatrix[2] = [-sin*cz, cos*cz, sz]

  cameraPosition.x = +projectionDistance * sin * cz
  cameraPosition.y = -projectionDistance * cos * cz
  cameraPosition.z = -projectionDistance * sz
  return angleZ
}

function num2hex(n) {
  if (n < 0) return '00'
  if (n > 255) return 'ff'
  return (256 + Math.round(n)).toString(16).substring(1)
}

function skyColorGradient(t) {
 const colorStops = [
    [0, [0xff, 0x88, 0x88]],
    [0.25, [0xff, 0xdd, 0xaa]],
    [0.5, [0x87, 0xce, 0xeb]],
    [0.75, [0x40, 0x60, 0xa0]],
    [1, [0x20, 0x30, 0x60]]
  ]
  const j = t < 0.25 ? 0 : t < 0.5 ? 1 : t < 0.75 ? 2 : 3
  const [t0, c0] = colorStops[j]
  const [t1, c1] = colorStops[j + 1]
  const ft = (t - t0) / (t1 - t0)
  return [
    c0[0] * (1 - ft) + c1[0] * ft,
    c0[1] * (1 - ft) + c1[1] * ft,
    c0[2] * (1 - ft) + c1[2] * ft
  ]
}

function skyColorAngleZ(angleZ) {
  const colorStops = [
    [-2, [0x40, 0x60, 0xa0]],
    [-1, [0x87, 0xce, 0xeb]],
    [1, [0xff, 0xdd, 0xaa]],
    [2, [0xff, 0x88, 0x88]]
  ]
  const rgbs = []
  const step = 10
  for (let i = 0; i < step; i++) {
    const t = -angleZ + (2 * (i / (step - 1)) - 1)
    let color
    if (t <= colorStops[0][0]) {
      color = colorStops[0][1]
    } else if (t > colorStops[colorStops.length - 1][0]) {
      color = colorStops[colorStops.length - 1][1]
    } else {
      for (let j = 0; j < colorStops.length - 1; j++) {
        const [t0, c0] = colorStops[j]
        const [t1, c1] = colorStops[j + 1]
        if (t0 <= t && t <= t1) {
          const ft = (t - t0) / (t1 - t0)
          color = [
            c0[0] * (1 - ft) + c1[0] * ft,
            c0[1] * (1 - ft) + c1[1] * ft,
            c0[2] * (1 - ft) + c1[2] * ft
          ]
        }
      }
    }
    rgbs.push(color)
  }
  return `linear-gradient(to bottom, ${rgbs.map(c => `#${num2hex(c[0])}${num2hex(c[1])}${num2hex(c[2])}`).join(', ')})`
}

function drawCubeWireframe(renderSide) {
  for (let axis = 0; axis < 3; axis++) {
    for (let side = 0; side < 4; side++) {
      const a = side % 2 * 2 - 1, b = (side >> 1) % 2 * 2 - 1
      const p = [a, b]
      p.splice(axis, 0, 0)
      const [v1, v2] = [-1, 1].map(c => {
        p[axis] = c
        return viewTransform({ x: p[0], y: p[1], z: p[2], xx: 0, yy: 0, zz: 0, xy: 0, yz: 0, zx: 0 })
      })
      if (renderSide != 0 && renderSide > 0 != (v1.z + v2.z) / 2 > 0) continue
      renderer.ctx.beginPath()
      renderer.ctx.moveTo(v1.x, v1.y)
      renderer.ctx.lineTo(v2.x, v2.y)
      renderer.ctx.lineWidth = 0.002
      renderer.ctx.stroke()
    }
  }
}

function draw() {
  renderer.clear()
  const angleZ = updateViewMatrix()
  canvas.style.background = skyColorAngleZ(angleZ)// 'linear-gradient(to bottom, #87ceeb, #ffddaa)'
  const screenspaceParticles = []
  shadow.clear()
  for (const p of particles) {
    shadow.addDensity(p.y * 0.8, p.z * 0.8, p.x * 0.8, 2)
  }
  shadow.calculateBrightness()

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    const phase = particlePhase[i] += 0.002
    if (phase < 1) {
      const alpha = phase < 0.1 ? phase * 10 : phase > 0.9 ? (1 - phase) * 10 : 1
      const brightness = shadow.brightnessAt(p.y * 0.8, p.z * 0.8, p.x * 0.8)
      const accentColor = Math.max(Math.min(0.5 - p.z, 1), 0.2)
      screenspaceParticles.push({ p: viewTransform(p), r: 0.05, a: alpha * 0.5, t: textures[i % textures.length], ca: accentColor, cb: brightness })
    } else {
      particlePhase[i] = 0
      const ip = initialPosition[i]
      p.x = ip.x
      p.y = ip.y
      p.z = ip.z
      p.xx = p.yy = p.zz = 1
      p.xy = p.yz = p.zx = 0
    }
  }
  renderSkySphere()
  drawCubeWireframe(+1)
  screenspaceParticles.sort((a, b) => b.p.z - a.p.z).forEach(({ p, r, a, t, ca, cb }) => {
    renderer.renderTexture(p, r, a, t, ca, cb)
  })
  drawCubeWireframe(-1)
}
draw()
setInterval(() => {
  update(); draw()
}, 10)
