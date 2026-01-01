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

function generateSmoothNoise(size, scale) {
  const rands = [...new Array(size)].map(() => [...new Array(size)].map(() => 2 * Math.random() - 1))
  return smooth2D(rands, scale)
}

function generateSmoothNoise3D(xsize, ysize, zsize, xscale, yscale, zscale) {
  const rands = [...new Array(xsize)].map(() => [...new Array(ysize)].map(() => [...new Array(zsize)].map(() => 2 * Math.random() - 1)))
  for (let ix = 0; ix < xsize; ix++) {
    for (let iy = 0; iy < ysize; iy++) {
      const output = smooth1D(rands[ix][iy], zscale)
      for (let iz = 0; iz < zsize; iz++) rands[ix][iy][iz] = output[iz]
    }
  }
  for (let ix = 0; ix < xsize; ix++) {
    for (let iz = 0; iz < zsize; iz++) {
      const input = []
      for (let iy = 0; iy < ysize; iy++) input[iy] = rands[ix][iy][iz]
      const output = smooth1D(input, yscale)
      for (let iy = 0; iy < ysize; iy++) rands[ix][iy][iz] = output[iy]
    }
  }
  for (let iy = 0; iy < ysize; iy++) {
    for (let iz = 0; iz < zsize; iz++) {
      const input = []
      for (let ix = 0; ix < xsize; ix++) input[ix] = rands[ix][iy][iz]
      const output = smooth1D(input, xscale)
      for (let ix = 0; ix < xsize; ix++) rands[ix][iy][iz] = output[ix]
    }
  }
  return rands
}

function generateNoise(size) {
  const scaledSmooths = []
  for (let scale = size; scale >= 1; scale /= 2) {
    scaledSmooths.push(generateSmoothNoise(size, scale))
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

function array2dToTexture(array2d) {
  const canvas = document.createElement('canvas')
  const sizeY = array2d.length
  const sizeX = array2d[0].length
  const min = Math.min(...array2d.flat())
  const max = Math.max(...array2d.flat())
  canvas.width = sizeX
  canvas.height = sizeY
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(sizeX, sizeY)
  const data = imageData.data
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      let index = (y * sizeX + x) * 4
      let v = (array2d[y][x] - min) / (max - min) * 255
      data[index] = v
      data[index + 1] = v
      data[index + 2] = v
      data[index + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
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
      data[index] = 255
      data[index + 1] = 255
      data[index + 2] = 255
      data[index + 3] = v
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function generateGrads(array2d) {
  const sizeY = array2d.length
  const sizeX = array2d[0].length
  const dxs = [...new Array(sizeY)].map(() => new Array(sizeX).fill(0))
  const dys = [...new Array(sizeY)].map(() => new Array(sizeX).fill(0))
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      const dx = array2d[y][(x + 1) % sizeX] - array2d[y][(x - 1 + sizeX) % sizeX]
      const dy = array2d[(y + 1) % sizeY][x] - array2d[(y - 1 + sizeY) % sizeY][x]
      dxs[y][x] = dx / 2
      dys[y][x] = dy / 2
    }
  }
  return [dxs, dys]
}

function generateRots(array2d) {
  const [xs, ys] = generateGrads(array2d)
  ys.forEach(row => row.forEach((v, i) => { row[i] = -v }))
  return [ys, xs]
}

function valueAt(array2d, x, y) {
  const sizeY = array2d.length
  const sizeX = array2d[0].length
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ix0 = ((ix + sizeX) % sizeX + sizeX) % sizeX
  const iy0 = ((iy + sizeY) % sizeY + sizeY) % sizeY
  const ix1 = (ix0 + 1) % sizeX
  const iy1 = (iy0 + 1) % sizeY
  return (
    array2d[ix0][iy0] * (1 - fx) + array2d[ix1][iy0] * fx
  ) * (1 - fy) + fy * (
    array2d[ix0][iy1] * (1 - fx) + array2d[ix1][iy1] * fx
  )
}

function valueAt3D(array3d, x, y, z) {
  const sizeZ = array3d.length
  const sizeY = array3d[0].length
  const sizeX = array3d[0][0].length
  const iz = Math.floor(z)
  const iy = Math.floor(y)
  const ix = Math.floor(x)
  const fz = z - iz
  const fy = y - iy
  const fx = x - ix
  const ix0 = ((ix + sizeX) % sizeX + sizeX) % sizeX
  const iy0 = ((iy + sizeY) % sizeY + sizeY) % sizeY
  const iz0 = ((iz + sizeZ) % sizeZ + sizeZ) % sizeZ
  const ix1 = (ix0 + 1) % sizeX
  const iy1 = (iy0 + 1) % sizeY
  const iz1 = (iz0 + 1) % sizeZ
  return (
    (array3d[ix0][iy0][iz0] * (1 - fx) + array3d[ix1][iy0][iz0] * fx) * (1 - fy) +
    (array3d[ix0][iy1][iz0] * (1 - fx) + array3d[ix1][iy1][iz0] * fx) * fy
  ) * (1 - fz) + fz * (
    (array3d[ix0][iy0][iz1] * (1 - fx) + array3d[ix1][iy0][iz1] * fx) * (1 - fy) +
    (array3d[ix0][iy1][iz1] * (1 - fx) + array3d[ix1][iy1][iz1] * fx) * fy
  )
}
