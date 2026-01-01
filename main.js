const textures = []
for(let i=0;i<16;i++) {
  textures.push(generateNoiseTexture(64, 64))
}

const noise3da = generateSmoothNoise3D(64, 64, 64, 4, 4, 4)
const noise3db = generateSmoothNoise3D(64, 64, 64, 3, 3, 3)
const noise3dc = generateSmoothNoise3D(64, 64, 64, 2, 2, 2)

const wave = generateSmoothNoise(256, 16)

for (const texture of textures) {
  document.body.appendChild(texture)
}

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
    const size = Math.min(this.width, this.height)
    this.ctx.translate(this.width / 2, this.height / 2)
    this.ctx.scale(size / 2, size / 2)
  }
  variant(texture, brightness) {
    this.variantCache = this.variantCache || new Map()
    const level = Math.round(brightness * 10)
    let levelCache = this.variantCache.get(texture)
    if (!levelCache) this.variantCache.set(texture, levelCache = [])
    if (levelCache[level]) return levelCache[level]
    const t = level / 10
    const r = Math.round(t * 128 + 128)
    const g = Math.round(t * 64 + 128)
    const b = Math.round(128)
    const variant = document.createElement('canvas')
    const ctx = variant.getContext('2d')
    variant.width = texture.width
    variant.height = texture.height
    ctx.drawImage(texture, 0, 0)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, 0, variant.width, variant.height)
    levelCache[level] = variant
    return variant
  }
  renderTexture(p, r, alpha, texture, color) {
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
    this.ctx.globalAlpha =  alpha / (1 + trace / 10)
    const tex = this.variant(texture, color)
    this.ctx.drawImage(tex, -r, -r, 2*r, 2*r)
    this.ctx.restore()
  }
  clear() {
    this.ctx.clearRect(-1, -1, 2, 2)
  }
}
const shadow = new ShadowMap3D(64)
const canvas = document.createElement('canvas')
canvas.style.display = 'block'
canvas.width = canvas.height = 512
document.body.appendChild(canvas)
const renderer = new Renderer(canvas)

const particles = []
for (let i = 0; i < 8000; i++) {
  let x = 0
  let y = 0
  for (let j = 0; j < 10; j++) {
    x += -0.4 + 0.8 * Math.random()
    y += -0.4 + 0.8 * Math.random()
    if (Math.random() < 100 * valueAt(wave, x * 256, y * 256)) break
  }
  particles.push({
    x,//: -0.4 + 0.8 * Math.random(),
    y,//: -0.4 + 0.8 * Math.random(),
    z: valueAt(wave, 200 * (x + y), 200 * (x - y)) * 10 - 0.05 + 0.1 * Math.random() + valueAt(wave, 32 * (x + y), 32 * (x - y)) * 20,
    xx: 1,
    yy: 1,
    zz: 1,
    xy: 0,
    yz: 0,
    zx: 0
  })
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
  let vx = 1, vy = 0, vz = 0
  let tx, ty, tz
  tx = x * 8 + 0.05 * time
  ty = y * 32 + 0.1 * time
  tz = z * 4
  vx += valueAt3D(noise3dc, tx, ty, tz) * 20
  vy += valueAt3D(noise3dc, tx, ty, tz + 10) * 20
  vz += valueAt3D(noise3dc, tx, ty, tz + 20) * 2
  tx = x * 8 - 0.1 * time
  ty = y * 32 + 0.05 * time
  tz = z * 4 + 3
  vx += valueAt3D(noise3dc, tx, ty, tz) * 20
  vy += valueAt3D(noise3dc, tx, ty, tz + 10) * 20
  vz += valueAt3D(noise3dc, tx, ty, tz + 20) * 2
  tx = x * 8 + 0.1 * time
  ty = y * 32 - 0.1 * time
  tz = z * 4 + 6
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

const viewTransformMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
]
function viewTransform(p) {
  const [[mxx, mxy, mxz], [myx, myy, myz], [mzx, mzy, mzz]] = viewTransformMatrix
  const { x, y, z, xx, yy, zz, xy, yz, zx } = p
  return {
    x: mxx * x + mxy * y + mxz * z,
    y: myx * x + myy * y + myz * z,
    z: mzx * x + mzy * y + mzz * z,
    xx: mxx * mxx * xx + mxy * mxy * yy + mxz * mxz * zz + 2 * (mxx * mxy * xy + mxy * mxz * yz + mxz * mxx * zx),
    yy: myx * myx * xx + myy * myy * yy + myz * myz * zz + 2 * (myx * myy * xy + myy * myz * yz + myz * myx * zx),
    xy: mxx * myx * xx + mxy * myy * yy + mxz * myz * zz + (mxx * myy + mxy * myx) * xy + (mxy * myz + mxz * myy) * yz + (mxz * myx + mxx * myz) * zx
  }
}

function updateViewMatrix() {
  const angleZ = 0.3 * Math.PI * mouse.y
  const angle = 0.5 * Math.PI * mouse.x
  const cz = Math.cos(angleZ)
  const sz = Math.sin(angleZ)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  viewTransformMatrix[0] = [cos, sin, 0]
  viewTransformMatrix[1] = [-sin*sz, cos*sz, -cz]
  viewTransformMatrix[2] = [-sin*cz, cos*cz, sz]
  return angleZ
}

function num2hex(n) {
  if (n < 0) return '00'
  if (n > 255) return 'ff'
  return (256 + Math.round(n)).toString(16).substring(1)
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

function draw() {
  renderer.clear()
  const angleZ = updateViewMatrix()
  canvas.style.background = skyColorAngleZ(angleZ)// 'linear-gradient(to bottom, #87ceeb, #ffddaa)'
  const screenspaceParticles = []
  shadow.clear()
  for (const p of particles) {
    shadow.addDensity(p.y * 0.8, p.z * 0.8, 0.8 * p.x - 0.2 * p.z, 4)
  }
  shadow.calculateBrightness()

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    const phase = particlePhase[i] += 0.002
    if (phase < 1) {
      const alpha = phase < 0.1 ? phase * 10 : phase > 0.9 ? (1 - phase) * 10 : 1
      const brightness = shadow.brightnessAt(p.y * 0.8, p.z * 0.8, 0.8 * p.x - 0.2 * p.z)
      screenspaceParticles.push({ p: viewTransform(p), r: 0.05, a: alpha * 0.5, t: textures[i % textures.length], c: brightness })
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
  screenspaceParticles.sort((a, b) => b.p.z - a.p.z).forEach(({ p, r, a, t, c }) => {
    renderer.renderTexture(p, r, a, t, c)
  })
}
draw()
setInterval(() => {
  update(); draw()
}, 10)
