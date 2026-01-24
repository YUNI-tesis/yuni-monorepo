/**
 * Type declarations for @three/fiber web component
 */

import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "canvas": {
        children: React.ReactNode;
        camera?: {
          position: [number, number, number];
          fov: number;
        };
        gl?: {
          antialias: boolean;
        };
      };
      "primitive": {
        object: {
          scene: import("three").Group;
        };
      };
      "ambientLight": {
        intensity: number;
      };
      "directionalLight": {
        position: [number, number, number];
        intensity?: number;
      };
      "OrbitControls": {
        enablePan?: boolean;
        enableZoom?: boolean;
        enableRotate?: boolean;
        enableDamping?: boolean;
        dampingFactor?: number;
        enableZoom?: boolean;
        maxDistance?: number;
        minDistance?: number;
        maxPolarAngle?: number;
        minPolarAngle?: number;
        maxAzimuthAngle?: number;
        minAzimuthAngle?: number;
      };
    }
  }
}
