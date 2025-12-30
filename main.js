

for(let i=0;i<256;i++)document.body.appendChild(generateNoiseTexture(64, 64))
document.body.appendChild(generateNoiseTexture(512, 512))

class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.width = canvas.width
    this.height = canvas.height
  }
}
