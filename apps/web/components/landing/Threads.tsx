"use client";

/**
 * Adapted from the MIT-licensed React Bits "Threads" background.
 * The shader, lifecycle and palette are tailored for YUNI's presence narrative.
 * Source inspiration: https://reactbits.dev/backgrounds/threads
 */

import { Mesh, Program, Renderer, Triangle } from "ogl";
import React, { useEffect, useRef } from "react";
import styles from "./Threads.module.css";

const vertex = /* glsl */ `
  attribute vec2 position;

  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uAmplitude;

  float threadLine(vec2 uv, float index) {
    float drift = sin(uv.x * (2.1 + index * 0.08) + uTime * (0.16 + index * 0.012) + index * 0.83);
    float detail = sin(uv.x * 5.4 - uTime * 0.11 + index * 1.37) * 0.26;
    float mousePull = uMouse.y * 0.12 * sin(uv.x * 1.8 + index);
    float y = (drift + detail) * uAmplitude + mousePull + (index - 5.5) * 0.115;
    float distanceToLine = abs(uv.y - y);
    float glow = 0.005 / max(distanceToLine, 0.002);
    float core = smoothstep(0.016, 0.002, distanceToLine);
    return min(glow * 0.11 + core * 0.5, 1.0);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
    uv.x += uMouse.x * 0.08;

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    for (int i = 0; i < 12; i++) {
      float index = float(i);
      float strength = threadLine(uv, index);
      float colorMix = 0.5 + 0.5 * sin(index * 0.76 + uTime * 0.08);
      color += mix(uColorA, uColorB, colorMix) * strength;
      alpha = max(alpha, strength);
    }

    float vignette = smoothstep(1.55, 0.16, length(uv * vec2(0.72, 1.0)));
    gl_FragColor = vec4(color * vignette, alpha * vignette * 0.92);
  }
`;

type ThreadsProps = {
  className?: string;
  amplitude?: number;
  enableMouseInteraction?: boolean;
  theme?: "dark" | "light";
};

export function Threads({
  className = "",
  amplitude = 0.17,
  enableMouseInteraction = true,
  theme = "dark",
}: ThreadsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = document.createElement("canvas");
    const contextAttributes = {
      alpha: true,
      antialias: false,
      depth: true,
      premultipliedAlpha: false,
    };
    const context = (canvas.getContext("webgl2", contextAttributes) ??
      canvas.getContext("webgl", contextAttributes)) as WebGL2RenderingContext | WebGLRenderingContext | null;

    if (!context) return;

    const isWebGl2 =
      typeof WebGL2RenderingContext !== "undefined" && context instanceof WebGL2RenderingContext;

    let renderer: Renderer;

    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio, 1.5),
        webgl: isWebGl2 ? 2 : 1,
      });
    } catch {
      (context as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    canvas.className = styles.canvas ?? "";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] },
        uMouse: { value: [0, 0] },
        uColorA: { value: theme === "light" ? [0, 0.561, 0.639] : [0.39, 0.76, 0.84] },
        uColorB: { value: theme === "light" ? [0.698, 0.286, 0.812] : [0.75, 0.35, 0.88] },
        uAmplitude: { value: amplitude },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const targetMouse = { x: 0, y: 0 };
    const smoothMouse = { x: 0, y: 0 };
    let isInViewport = true;
    let isPageVisible = !document.hidden;
    let frameId = 0;
    let startTime = performance.now();

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(Math.max(width, 1), Math.max(height, 1));
      program.uniforms.uResolution.value = [canvas.width, canvas.height];
    };

    const render = (time: number) => {
      frameId = 0;
      if (!isInViewport || !isPageVisible) return;

      smoothMouse.x += (targetMouse.x - smoothMouse.x) * 0.045;
      smoothMouse.y += (targetMouse.y - smoothMouse.y) * 0.045;
      program.uniforms.uMouse.value = [smoothMouse.x, smoothMouse.y];
      program.uniforms.uTime.value = (time - startTime) * 0.001;
      renderer.render({ scene: mesh });
      frameId = requestAnimationFrame(render);
    };

    const requestRender = () => {
      if (frameId === 0 && isInViewport && isPageVisible) {
        startTime = performance.now() - program.uniforms.uTime.value * 1000;
        frameId = requestAnimationFrame(render);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!enableMouseInteraction) return;
      const rect = container.getBoundingClientRect();
      targetMouse.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      targetMouse.y = (0.5 - (event.clientY - rect.top) / rect.height) * 2;
    };

    const handleVisibility = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) requestRender();
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isInViewport = entry?.isIntersecting ?? true;
        if (isInViewport) requestRender();
      },
      { rootMargin: "160px" }
    );

    resizeObserver.observe(container);
    intersectionObserver.observe(container);
    container.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    resize();
    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (canvas.parentNode === container) container.removeChild(canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [amplitude, enableMouseInteraction, theme]);

  return (
    <div ref={containerRef} className={`${styles.root ?? ""} ${className}`} aria-hidden="true">
      <div className={styles.fallback} />
    </div>
  );
}
