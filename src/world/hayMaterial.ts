import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

/** Tekstur goresan jerami (abu-abu, dipakai sebagai pengali warna). */
function makeStrawTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgb(196,196,196)';
  g.fillRect(0, 0, size, size);
  const rnd = mulberry32(1234);
  for (let n = 0; n < 900; n++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const dominant = rnd() < 0.6;
    const ang = dominant ? -0.5 + (rnd() - 0.5) * 0.7 : rnd() * Math.PI;
    const len = 14 + rnd() * 60;
    const c = Math.floor(120 + rnd() * 135);
    g.strokeStyle = `rgba(${c},${c},${c},${0.5 + rnd() * 0.5})`;
    g.lineWidth = 0.8 + rnd() * 1.8;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
        g.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Material permukaan tumpukan: warna vertex × tekstur jerami triplanar (world space). */
export function createHayMaterial(): THREE.MeshLambertMaterial {
  const tex = makeStrawTexture();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.hayTex = { value: tex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHayPos;\nvarying vec3 vHayNrm;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvHayPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvHayNrm = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D hayTex;\nvarying vec3 vHayPos;\nvarying vec3 vHayNrm;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 bw = pow(abs(normalize(vHayNrm)), vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        vec3 tx = texture2D(hayTex, vHayPos.zy * 0.7).rgb;
        vec3 ty = texture2D(hayTex, vHayPos.xz * 0.7).rgb;
        vec3 tz = texture2D(hayTex, vHayPos.xy * 0.7).rgb;
        diffuseColor.rgb *= (tx * bw.x + ty * bw.y + tz * bw.z) * 1.3;`,
      );
  };
  return mat;
}
