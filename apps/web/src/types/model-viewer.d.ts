/**
 * Type declarations for @google/model-viewer web component
 */

import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": {
        src?: string;
        ar?: boolean;
        "auto-rotate"?: boolean;
        "camera-controls"?: boolean;
        style?: React.CSSProperties;
        className?: string;
        [key: string]: any;
      };
    }
  }
}
