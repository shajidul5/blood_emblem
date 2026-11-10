import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { citySpriteOrder, createCityOcclusion } from '../src/levels/city-occlusion.js';

function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 14, 10);
  camera.lookAt(0, 0, 0);
  const geometry = new THREE.PlaneGeometry(3, 5);
  geometry.translate(0, 2.5, 0);
  const texture = new THREE.Texture({ width: 64, height: 64, data: new Uint8Array(64 * 64 * 4).fill(255) });
  const building = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  building.rotation.x = -Math.atan2(14, 10);
  building.position.z = 1;
  building.renderOrder = citySpriteOrder(1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4),
    new THREE.MeshBasicMaterial({ map: texture }));
  mesh.rotation.copy(building.rotation);
  mesh.position.set(0, 0.7, 0);
  mesh.renderOrder = 2;
  mesh.userData.healthBar = { group: new THREE.Group() };
  mesh.userData.healthBar.group.visible = false;
  scene.add(building, mesh);
  return { scene, camera, building, unit: { hp: 20, mesh }, occlusion: createCityOcclusion(THREE, [building]) };
}

test('City units and structures share foot-position layering, with indicators only behind overlapping scenery', () => {
  const { camera, building, unit, occlusion } = fixture();
  occlusion.update([unit], null, camera);
  assert.ok(unit.mesh.renderOrder < building.renderOrder);
  assert.equal(unit.mesh.material.transparent, true);
  assert.equal(unit.mesh.material.depthTest, false);
  assert.equal(unit.mesh.userData.cityOccluded, true);
  const outline = unit.mesh.children[0];
  assert.equal(outline.visible, true);
  assert.equal(outline.renderOrder, 4);
  assert.equal(outline.material.depthWrite, false);
  assert.match(outline.material.fragmentShader, /if \(body >= 0.5 \|\| edge < 0.5\) discard/,
    'indicator draws a thin contour rather than revealing the full body');
  assert.equal(unit.mesh.userData.healthBar.group.visible, true);
  unit.mesh.position.z = 2;
  occlusion.update([unit], null, camera);
  assert.ok(unit.mesh.renderOrder > building.renderOrder);
  assert.equal(unit.mesh.userData.cityOccluded, false);
  assert.equal(outline.visible, false);
  unit.mesh.position.set(8, 0.7, 0);
  occlusion.update([unit], null, camera);
  assert.equal(unit.mesh.userData.cityOccluded, false, 'same row alone does not count as obstruction');
  occlusion.dispose();
});

test('Obstructing structures stay faded for unselected units and restore when the unit moves clear', () => {
  const { camera, building, unit, occlusion } = fixture();
  occlusion.update([unit], unit, camera);
  assert.equal(building.material.opacity, 0.28);
  assert.equal(unit.mesh.children[0].visible, false);
  occlusion.update([unit], null, camera);
  assert.equal(building.material.opacity, 0.28, 'clearing selection does not hide the unit again');
  assert.equal(unit.mesh.children[0].visible, true);
  unit.mesh.position.x = 8;
  occlusion.update([unit], null, camera);
  assert.equal(building.material.opacity, 1);
  unit.mesh.position.x = 0;
  building.visible = false;
  occlusion.update([unit], unit, camera);
  assert.equal(unit.mesh.userData.cityOccluded, false, 'opened portals do not obscure units');
  building.visible = true;
  occlusion.update([unit], unit, camera);
  occlusion.dispose();
  assert.equal(building.material.opacity, 1, 'teardown also clears any obstruction fade');
});

test('Any living ally or enemy keeps a shared obstruction faded until all units leave', () => {
  const { scene, camera, building, unit, occlusion } = fixture();
  const enemyMesh = unit.mesh.clone();
  enemyMesh.material = unit.mesh.material.clone();
  enemyMesh.position.x = 0.25;
  scene.add(enemyMesh);
  const enemy = { hp: 20, mesh: enemyMesh };
  occlusion.update([unit, enemy], null, camera);
  assert.equal(building.material.opacity, 0.28);
  unit.mesh.position.x = 8;
  occlusion.update([unit, enemy], null, camera);
  assert.equal(building.material.opacity, 0.28, 'remaining enemy still needs visibility');
  enemy.hp = 0;
  occlusion.update([unit, enemy], null, camera);
  assert.equal(building.material.opacity, 1, 'dead units do not keep structures faded');
  enemy.hp = 20;
  enemyMesh.visible = false;
  occlusion.update([unit, enemy], null, camera);
  assert.equal(building.material.opacity, 1, 'hidden or undeployed units do not fade structures');
  occlusion.dispose();
});

test('Moving units use interpolated mesh positions and changing animation frames updates their contour', () => {
  const { camera, unit, occlusion } = fixture();
  occlusion.update([unit], null, camera);
  const replacement = new THREE.Texture({ width: 128, height: 96, data: new Uint8Array(128 * 96 * 4).fill(255) });
  unit.mesh.material.map = replacement;
  unit.mesh.position.z = 0.5;
  occlusion.update([unit], null, camera);
  assert.equal(unit.mesh.renderOrder, citySpriteOrder(0.5));
  const { uniforms } = unit.mesh.children[0].material;
  assert.equal(uniforms.map.value, replacement);
  assert.equal(uniforms.texel.value.x, 1 / 128);
  assert.equal(uniforms.texel.value.y, 1 / 96);
  occlusion.dispose();
});

test('Transparent roof padding and open arches do not falsely mark exposed units as obscured', () => {
  const { camera, building, unit, occlusion } = fixture();
  building.material.map = new THREE.Texture({ width: 64, height: 64, data: new Uint8Array(64 * 64 * 4) });
  occlusion.update([unit], unit, camera);
  assert.equal(unit.mesh.userData.cityOccluded, false);
  assert.equal(building.material.opacity, 1);
  assert.equal(unit.mesh.children[0].visible, false);
  occlusion.dispose();
});

test('Death, removal and chapter teardown remove contours and restore original rendering without disposing shared art', () => {
  for (const reason of ['death', 'removed', 'dispose']) {
    const { camera, unit, occlusion } = fixture();
    let disposed = 0, artDisposed = 0;
    unit.mesh.material.map.addEventListener('dispose', () => artDisposed++);
    unit.mesh.geometry.addEventListener('dispose', () => artDisposed++);
    occlusion.update([unit], null, camera);
    unit.mesh.children[0].material.addEventListener('dispose', () => disposed++);
    if (reason === 'death') { unit.hp = 0; occlusion.update([unit], null, camera); }
    else if (reason === 'removed') occlusion.update([], null, camera);
    occlusion.dispose();
    assert.equal(disposed, 1);
    assert.equal(artDisposed, 0);
    assert.equal(unit.mesh.children.length, 0);
    assert.equal(unit.mesh.userData.cityOccluded, undefined);
    assert.equal(unit.mesh.material.transparent, false);
    assert.equal(unit.mesh.material.depthTest, true);
    assert.equal(unit.mesh.material.depthWrite, true);
    assert.equal(unit.mesh.renderOrder, 2);
  }
});
