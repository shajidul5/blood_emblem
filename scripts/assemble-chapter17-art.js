export async function assembleChapter17Art(map, source) {
  if (source.width < 1088 || source.height < 1088) throw new Error('Shore materials atlas must contain four 512px native regions.');
  const tile = 64;
  const canvas = document.createElement('canvas');
  canvas.width = map.width * tile;
  canvas.height = map.height * tile;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) {
    const id = map.tiles[z][x];
    if (id === 'shore_sea') continue;
    let material = [0, 0];
    if (id === 'shore_lift' || id === 'shore_gate' || id === 'shore_trial' || (x >= 19 && x <= 29) || x >= 33) {
      material = [576, 576];
    }
    if (id === 'shore_bridge') material = [576, 0];
    context.drawImage(source, material[0] + x % 8 * tile, material[1] + z % 8 * tile, tile, tile,
      x * tile, z * tile, tile, tile);
    context.fillStyle = 'rgba(10,17,31,.41)';
    context.fillRect(x * tile, z * tile, tile, tile);
  }
  context.strokeStyle = 'rgba(120,142,160,.78)';
  context.lineWidth = 3;
  const line = (x1, y1, x2, y2) => {
    context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
  };
  for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) {
    if (map.tiles[z][x] === 'shore_sea') continue;
    const px = x * tile, py = z * tile;
    if (x === 0 || map.tiles[z][x - 1] === 'shore_sea') line(px + 2, py, px + 2, py + tile);
    if (x === map.width - 1 || map.tiles[z][x + 1] === 'shore_sea') line(px + tile - 2, py, px + tile - 2, py + tile);
    if (z === 0 || map.tiles[z - 1][x] === 'shore_sea') line(px, py + 2, px + tile, py + 2);
    if (z === map.height - 1 || map.tiles[z + 1][x] === 'shore_sea') line(px, py + tile - 2, px + tile, py + tile - 2);
  }
  return canvas;
}
