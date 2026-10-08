import * as THREE from "three";
import { threeSceneSchema, threeObjectPose, type ThreeScene } from "@hanuman/shared-types";

/** Shared renderer for interactive preview and exact-frame cloud baking. */
export function createThreeRenderer(canvas: HTMLCanvasElement, input: ThreeScene, width: number, height: number, capture = false) {
  const spec = threeSceneSchema.parse(input);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Standard materials without tone mapping match the sRGB capture target and preview.
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(spec.background);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x253354, 2));
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7dd3fc, 2);
  rim.position.set(-4, 2, -3); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(spec.camera.fov ?? 40, width / height, 0.01, 50000);
  const meshes = spec.objects.map(object => {
    const geometry = object.geometry === "sphere" ? new THREE.SphereGeometry(1, 48, 32)
      : object.geometry === "torus" ? new THREE.TorusGeometry(1, 0.035, 12, 96)
      : object.geometry === "cone" ? new THREE.ConeGeometry(0.5, 1, 32)
      : object.geometry === "cylinder" ? new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
      : object.geometry === "plane" ? new THREE.PlaneGeometry(1, 1) : new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: object.color, roughness: object.roughness ?? 0.4,
      metalness: object.metalness ?? 0.2, wireframe: object.wireframe ?? false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); scene.add(mesh); return mesh;
  });
  const target = capture ? new THREE.WebGLRenderTarget(width, height, { samples: 4, depthBuffer: true }) : null;
  if (target) target.texture.colorSpace = THREE.SRGBColorSpace;
  const pixels = capture ? new Uint8Array(width * height * 4) : null;
  let lost = false;
  const onLost = () => { lost = true; };
  canvas.addEventListener("webglcontextlost", onLost);
  function updateAt(seconds: number) {
    if (lost) throw new Error("3D graphics context lost. Reload the preview or retry export.");
    const time = Math.max(0, seconds);
    spec.objects.forEach((object, i) => {
      const pose = threeObjectPose(object, time); const mesh = meshes[i]!;
      mesh.position.fromArray(pose.position); mesh.rotation.set(...pose.rotation); mesh.scale.fromArray(pose.scale);
    });
    const origin = new THREE.Vector3(...(spec.camera.target ?? [0, 0, 0]));
    camera.position.fromArray(spec.camera.position).sub(origin).applyAxisAngle(new THREE.Vector3(0, 1, 0), time * (spec.camera.orbitSpeed ?? 0)).add(origin);
    camera.lookAt(origin);
  }
  function renderAt(seconds: number) {
    updateAt(seconds);
    renderer.setRenderTarget(target); renderer.render(scene, camera);
  }
  const gl = renderer.getContext(); const debug = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    backend: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    async prepare() { updateAt(0); renderer.setRenderTarget(target); await renderer.compileAsync(scene, camera); },
    renderAt,
    resize(w: number, h: number) { if (capture) throw new Error("Capture size is fixed"); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    async readFrame(seconds: number) {
      if (!target || !pixels) throw new Error("Capture not enabled");
      renderAt(seconds);
      await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, pixels);
      return pixels;
    },
    dispose() { canvas.removeEventListener("webglcontextlost", onLost); for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); } target?.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
