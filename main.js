const textures = []
for(let i=0;i<32;i++) {
  textures.push(generateNoiseTexture(64, 64))
}

const wave = generateSmoothNoise(256, 16)
const [rotvx, rotvy] = generateRots(wave)
document.body.appendChild(array2dToTexture(wave))
document.body.appendChild(array2dToTexture(rotvx))
document.body.appendChild(array2dToTexture(rotvy))

for (const texture of textures) {
  document.body.appendChild(texture)
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
  renderTexture(p, r, texture) {
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
    const alpha = this.ctx.globalAlpha / (1 + trace / 10)

    // const wireframe = 1/(1+Math.exp(20*p.x))/(1+Math.exp(20*p.y))
    const wireframe = 0
    this.ctx.globalAlpha = alpha * wireframe
    this.ctx.strokeStyle = 'white'
    this.ctx.beginPath()
    this.ctx.arc(0, 0, r, 0, 2 * Math.PI)
    this.ctx.lineWidth = r/10
    this.ctx.stroke()
    this.ctx.globalAlpha = alpha * (1 - wireframe)
    this.ctx.drawImage(texture, -r, -r, 2*r, 2*r)
    this.ctx.restore()
  }
  clear() {
    this.ctx.clearRect(-1, -1, 2, 2)
  }
}

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
    z: valueAt(wave, 200 * (x + y), 200 * (x - y)) * 20 - 0.05 + 0.1 * Math.random(),
    xx: 1,
    yy: 1,
    zz: 1,
    xy: 0,
    yz: 0,
    zx: 0
  })
}

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
  let vx = 0, vy = 0, vz = 0
  let tx, ty
  tx = x * 256 + 0.1 * time + 140 * z
  ty = y * 256 + 0.2 * time + 120 * z
  vx += valueAt(rotvx, tx, ty) * 2000
  vy += valueAt(rotvy, tx, ty) * 2000
  vz += valueAt(wave, tx*1.1, ty*1.1) * 20
  tx = x * 256 - 0.2 * time - 120 * z
  ty = y * 256 + 0.1 * time + 140 * z
  vx += valueAt(rotvx, tx, ty) * 2000
  vy += valueAt(rotvy, tx, ty) * 2000
  vz += valueAt(wave, tx*1.2, ty*1.2) * 20
  tx = x * 256 + 0.2 * time - 130 * z
  ty = y * 256 - 0.2 * time + 130 * z
  vx += valueAt(rotvx, tx, ty) * 2000
  vy += valueAt(rotvy, tx, ty) * 2000
  vz += valueAt(wave, tx*1.3, ty*1.3) * 20
  // vz += valueAt(wave, x * 256 + 0.01 * time, y * 256 + 0.02 * time) * 20
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
  [0, 1, 0]
]
function viewTransform(p) {
  const [[mxx, mxy, mxz], [myx, myy, myz]] = viewTransformMatrix
  const { x, y, z, xx, yy, zz, xy, yz, zx } = p
  return {
    x: mxx * x + mxy * y + mxz * z,
    y: myx * x + myy * y + myz * z,
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
  viewTransformMatrix[1] = [-sin*sz, cos*sz, cz]
}

function draw() {
  renderer.clear()
  let i = 0
  updateViewMatrix()
  for (const p of particles) {
    renderer.ctx.globalAlpha = 0.1
    renderer.renderTexture(viewTransform(p), 0.05, textures[i % textures.length])
    i++
  }
}
draw()
setInterval(() => {
  update(); draw()
}, 10)
