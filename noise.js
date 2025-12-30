function smooth2D(data, scale) {
  const row = []
  const output = data.map(() => [])
  const size = data.length
  const subsize = data[0].length
  for (let j = 0; j < subsize; j++) {
    for (let i = 0; i < size; i++) row[i] = data[i][j]
    const smoothRow = smooth1D(row, scale)
    for (let i = 0; i < size; i++) output[i][j] = smoothRow[i]
  }
  return output.map(row => smooth1D(row, scale))
}

function smooth1D(data, scale) {
  const e1 = Math.exp(-1 / scale)
  const e2 = e1 * e1
  const output = []
  const vscale = 4 / (1 - e1) - 2 / (1 - e2) - 1
  // forward pass
  let sum1 = 0
  let sum2 = 0
  for (const v of data) {
    sum1 = sum1 * e1 + v
    sum2 = sum2 * e2 + v
  }
  sum1 = sum1 / (1 - e1**data.length)
  sum2 = sum2 / (1 - e2**data.length)
  for (let i = 0; i < data.length; i++) {
    sum1 = sum1 * e1 + data[i]
    sum2 = sum2 * e2 + data[i]
    output[i] = (2 * sum1 - sum2) / vscale
  }
  // backward pass
  sum1 = sum2 = 0
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i]
    sum1 = sum1 * e1 + v
    sum2 = sum2 * e2 + v
  }
  sum1 = sum1 / (1 - e1**data.length)
  sum2 = sum2 / (1 - e2**data.length)
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i]
    sum1 *= e1
    sum2 *= e2
    output[i] += (2 * sum1 - sum2) / vscale
    sum1 += v
    sum2 += v
  }
  return output
}

function generateNoise(size) {
  const rands = [...new Array(size)].map(() => [...new Array(size)].map(() => 2 * Math.random() - 1))
  const scaledSmooths = []
  for (let scale = size; scale >= 1; scale /= 2) {
    scaledSmooths.push(smooth2D(rands, scale))
  }
  const output = []
  let min = Infinity, max = -Infinity;
  for (let y = 0; y < size; y++) {
    output[y] = []
    for (let x = 0; x < size; x++) {
      let value = 0
      for (let i = 0; i < scaledSmooths.length; i++) {
        value += scaledSmooths[i][y][x] / 3**i
      }
      output[y][x] = value
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  for (const row of output) {
    for (let i = 0; i < size; i++) {
      row[i] = (row[i] - min) / (max - min)
    }
  }
  return output
}

function generateNoiseTexture(size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  const noise = generateNoise(size)

  const imageData = ctx.createImageData(size, size)
  const data = imageData.data

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let index = (y * size + x) * 4
      const r2 = ((2*x - size - 0.5)**2 + (2*y - size - 0.5)**2) / size**2
      let v = 256 * (noise[y][x]* 1.2 - 0.2) * (r2 > 1 ? 0 : (1 - r2)**2)
      if (v < 0) v = 0
      if (v > 255) v = 255
      data[index] = v
      data[index + 1] = v
      data[index + 2] = v
      data[index + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}