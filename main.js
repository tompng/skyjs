const textures = []
for(let i=0;i<64;i++) {
  textures.push(generateNoiseTexture(64, 64))
}

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
    this.ctx.globalAlpha /= 1 + (p.xx + p.yy) * 0.1
    this.ctx.transform(a, c, c, b, p.x, p.y)
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
for (let i = 0; i < 1000; i++) {
  particles.push({
    x: -0.5 + Math.random(),
    y: -0.5 + 0.5*Math.random(),
    // x: -0.5 + 1 * Math.floor(i / 32) / 32,
    // y: -0.5 + 1 * Math.floor(i % 32) / 32,
    xx: 1,
    yy: 1,
    xy: 0
  })
}

const vortexCenter = { x: 0, y: 0 }
const eventHandler = (e) => {
  const rect = canvas.getBoundingClientRect()
  const x = 2 * (e.clientX - rect.left) / rect.width - 1
  const y = 2 * (e.clientY - rect.top) / rect.height - 1
  vortexCenter.x = Math.min(Math.max(-0.9, x), 0.9)
  vortexCenter.y = Math.min(Math.max(-0.9, y), 0.9)
}
document.addEventListener('pointermove', eventHandler)
document.addEventListener('pointerdown', eventHandler)

function Velocity(x, y) {
  x -= vortexCenter.x
  y -= vortexCenter.y
  const r = x * x + y * y
  const v = 1 / (0.5 + r) / 2
  return { x: -y / r * v, y: x / r * v }
}

function normalizeParticle(p) {
  // Assume non-divergent field. det should be 1.
  const det = p.xx * p.yy - p.xy * p.xy
  if (det < 0) return
  const scale = 1 / Math.sqrt(det)
  p.xx *= scale
  p.yy *= scale
  p.xy *= scale
}

// Normalize level 2. Limit the eccentricity.
function normalizeParticle2(p) {
  normalizeParticle(p)
  const { xx, yy, xy } = p
  const len = xx * xx + yy * yy // long + short
  const maxLen = 4
  if (len > maxLen) {
    // det2 = (xx+add)*(yy+add)-xy*xy
    // (xx+z)**2 + (yy+z)**2 = maxLen * det
    const a = maxLen - 2
    const b = (maxLen - 2) * (xx + yy)
    const c = maxLen * (xx * yy - xy * xy) - xx * xx - yy * yy
    const add = (-b + Math.sqrt(b * b - 4 * a * c)) / 2 / a
    p.xx += add
    p.yy += add
    normalizeParticle(p)
  }
}

function update() {
  for (const p of particles) {
    const v = Velocity(p.x, p.y)
    // grad of v
    const delta = 0.001
    const vscale = 0.001
    const vxp = Velocity(p.x + delta, p.y)
    const vxm = Velocity(p.x - delta, p.y)
    const vyp = Velocity(p.x, p.y + delta)
    const vym = Velocity(p.x, p.y - delta)
    const fxx = 1 + (vxp.x - vxm.x) / 2 / delta * vscale
    const fxy = (vyp.x - vym.x) / 2 / delta * vscale
    const fyx = (vxp.y - vxm.y) / 2 / delta * vscale
    const fyy = 1 + (vyp.y - vym.y) / 2 / delta * vscale
    // Transform:
    // x2 = fxx*x + fxy*y
    // y2 = fyx*x + fyy*y
    // Covariance of x2, y2:
    const xx = fxx * fxx * p.xx + fxy * fxy * p.yy + 2 * fxx * fxy * p.xy
    const yy = fyx * fyx * p.xx + fyy * fyy * p.yy + 2 * fyx * fyy * p.xy
    const xy = fxx * fyx * p.xx + fxy * fyy * p.yy + (fxx * fyy + fxy * fyx) * p.xy
    p.x += vscale * v.x
    p.y += vscale * v.y
    p.xx = xx
    p.yy = yy
    p.xy = xy
  }
}

for (let i = 0; i < 100; i++) update()

function draw() {
  renderer.clear()
  let i = 0
  for (const p of particles) {
    renderer.ctx.globalAlpha = 0.1
    normalizeParticle2(p)
    renderer.renderTexture(p, 0.1, textures[i % textures.length])
    i++
  }
}
draw()
setInterval(() => {
  update(); draw()
}, 10)
