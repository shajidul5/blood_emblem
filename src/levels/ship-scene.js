import { citySpriteOrder, createCityOcclusion } from './city-occlusion.js';

export const SHIP_TILE_IDS = ['ship_deck', 'ship_steps', 'ship_gangway', 'ship_obstacle', 'ship_rail'];

export function validateShipScene(value, level) {
  const hasShipTiles = level.tileIds.some((row) => row.some((id) => SHIP_TILE_IDS.includes(id)));
  if (value === undefined || value === null) {
    if (hasShipTiles) throw new Error('Illustrated ship terrain requires a shipScene layout.');
    return undefined;
  }
  if (!value || value.version !== 1 || !['two-ships', 'lone-ship'].includes(value.layout) ||
      level.width !== (value.layout === 'two-ships' ? 19 : 9) || level.height !== 21 ||
      level.lighting !== 'night' || level.objects.length ||
      level.tileIds.some((row) => row.some((id) => !SHIP_TILE_IDS.includes(id) && id !== 'water_a'))) {
    throw new Error('Ship scenes require a version 1 night layout, matching dimensions and illustrated terrain without duplicate props.');
  }
  return { version: 1, layout: value.layout };
}

export function shipWind(elapsed) {
  return 0.7 + Math.sin(elapsed * 0.47) * 0.18 + Math.sin(elapsed * 1.13) * 0.12;
}

export function flagDisplacement(u, v, elapsed, phase = 0) {
  return Math.sin(u * 9 - elapsed * 6 + phase + v * 1.8) * u * 0.09 * shipWind(elapsed);
}

function textureFor(THREE, image) {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function addShipScene(THREE, group, level, images) {
  const lone = level.shipScene.layout === 'lone-ship';
  const time = { value: 0 };
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.ShaderMaterial({
    uniforms: { uTime: time },
    vertexShader: `
      varying vec2 world;
      void main() {
        vec4 p = modelMatrix * vec4(position, 1.0);
        world = p.xz;
        gl_Position = projectionMatrix * viewMatrix * p;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 world;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main() {
        vec2 p = floor(world * 27.0) / 27.0;
        float swell = sin(p.y * 1.3 + p.x * .21 - uTime * .55);
        vec3 color = mix(vec3(.003,.008,.018),vec3(.012,.025,.042),swell*.5+.5);
        vec2 drift = p - vec2(uTime*.38,uTime*.07);
        vec2 cell = floor(drift * vec2(1.7,5.0));
        vec2 local = fract(drift * vec2(1.7,5.0));
        float crest = step(.94,hash(cell)) * step(.67,local.y) * step(local.y,.83)
          * step(.1,local.x) * step(local.x,.75);
        color += crest * (.014 + .006*sin(uTime+cell.x));
        vec2 gust = fract((p-vec2(uTime*.9,uTime*.12))*vec2(.34,2.2));
        float wind = step(.97,hash(floor((p-vec2(uTime*.9,uTime*.12))*vec2(.34,2.2))))
          * step(.45,gust.y) * step(gust.y,.48) * step(gust.x,.7);
        color += wind * .018;
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  ocean.name = 'ship-ocean';
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.07;
  group.add(ocean);

  const artwork = textureFor(THREE, lone ? images.lone : images.two);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(level.width, level.height),
    new THREE.MeshBasicMaterial({ map: artwork, transparent: true, alphaTest: 0.08 }));
  deck.name = 'illustrated-ships';
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.01;
  group.add(deck);

  const foam = new THREE.Mesh(new THREE.PlaneGeometry(level.width, level.height), new THREE.ShaderMaterial({
    uniforms: { uTime: time, silhouette: { value: artwork }, pixel: { value: new THREE.Vector2(1 / (lone ? 244 : 512), 1 / 512) } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec2 tex;
      void main() { tex=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D silhouette;
      uniform vec2 pixel;
      uniform float uTime;
      varying vec2 tex;
      void main() {
        float center=texture2D(silhouette,tex).a;
        float nearHull=0.0;
        for(int i=0;i<4;i++) {
          float a=float(i)*1.570796;
          vec2 offset=vec2(cos(a),sin(a))*pixel*(2.0+floor(sin(uTime*1.4+tex.y*20.0)+1.0));
          nearHull=max(nearHull,texture2D(silhouette,clamp(tex+offset,0.0,1.0)).a);
        }
        float pulse=.14+.12*sin(tex.y*60.0-uTime*2.0);
        gl_FragColor=vec4(.27,.43,.50,(1.0-center)*nearHull*pulse);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  foam.name = 'ship-hull-foam';
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = -0.02;
  group.add(foam);

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext('2d');
  if (!glowContext) throw new Error('Could not create ship lantern glow.');
  const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,195,100,0.65)');
  gradient.addColorStop(.3, 'rgba(225,125,50,0.2)');
  gradient.addColorStop(1, 'rgba(120,65,20,0)');
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 64, 64);
  const glowTexture = textureFor(THREE, glowCanvas);
  const glows = [];
  for (const [px, py] of [[72, 237], [174, 106]]) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({
      map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.name = 'ship-lantern-glow';
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(px / (lone ? 244 : 512) * level.width - level.width / 2,
      .025, py / 512 * level.height - level.height / 2);
    group.add(glow);
    glows.push(glow);
  }

  const flags = [];
  const flagTexture = textureFor(THREE, images.flag);
  const anchors = lone ? [[130, 345]] : [[130, 345], [383, 146]];
  for (const [index, [px, py]] of anchors.entries()) {
    const anchorX = px / (lone ? 244 : 512) * level.width - level.width / 2;
    const anchorZ = py / 512 * level.height - level.height / 2;
    const pole = new THREE.Mesh(new THREE.PlaneGeometry(.045, 1.7),
      new THREE.MeshBasicMaterial({ color: 0x7d7772, side: THREE.DoubleSide }));
    pole.geometry.translate(0, .85, 0);
    pole.rotation.x = -Math.atan2(14, 10);
    pole.position.set(anchorX, .04, anchorZ);
    pole.name = 'ship-pennant-pole';
    group.add(pole);
    const geometry = new THREE.PlaneGeometry(1.65, .825, 24, 6);
    geometry.translate(.69, 1.45, 0);
    const material = new THREE.MeshBasicMaterial({
      map: flagTexture, color: index ? 0x8c9cac : 0xb0a0af,
      transparent: true, alphaTest: .1, side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(geometry, material);
    flag.name = 'ship-wind-flag';
    flag.renderOrder = citySpriteOrder(anchorZ);
    flag.rotation.x = pole.rotation.x;
    flag.position.copy(pole.position);
    group.add(flag);
    flags.push({ mesh: flag, positions: geometry.attributes.position.array.slice(), phase: index * 1.7 });
  }
  const occlusion = createCityOcclusion(THREE, flags.map(({ mesh }) => mesh));
  const state = {
    occlusion,
    dispose() { occlusion.dispose(); },
    flags, time,
    update(elapsed) {
      time.value = reducedMotion ? elapsed * .3 : elapsed;
      for (const [index, glow] of glows.entries()) {
        glow.material.opacity = .78 + Math.sin(time.value * 7 + index * 2) * .06;
      }
      for (const flag of flags) {
        const attribute = flag.mesh.geometry.attributes.position;
        const uv = flag.mesh.geometry.attributes.uv;
        for (let i = 0; i < attribute.count; i++) {
          const displacement = flagDisplacement(uv.getX(i), uv.getY(i), time.value, flag.phase);
          attribute.setXYZ(i, flag.positions[i * 3], flag.positions[i * 3 + 1] + displacement,
            reducedMotion ? 0 : displacement * .6);
        }
        attribute.needsUpdate = true;
      }
    },
  };
  group.userData.shipScene = state;
  return state;
}
