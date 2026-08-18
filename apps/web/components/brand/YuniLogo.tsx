import React, { type SVGProps, useId } from "react";

export function YuniLogo(props: SVGProps<SVGSVGElement>) {
  const instanceId = useId().replace(/:/g, "");
  const filterAId = `yuni-logo-filter-a-${instanceId}`;
  const filterBId = `yuni-logo-filter-b-${instanceId}`;
  const paintAId = `yuni-logo-paint-a-${instanceId}`;
  const paintBId = `yuni-logo-paint-b-${instanceId}`;

  return (
    <svg width="95" height="81" viewBox="0 0 95 81" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g data-yuni-body="back" filter={`url(#${filterAId})`}>
        <path
          d="M67.9534 13.6182C92.2611 18.4796 84.4534 69.6181 75.4534 76.6181C64.3112 85.2842 53.9534 76.1181 44.9534 75.1181C35.9534 74.1181 31.9534 81.6181 18.4534 75.1181C7.65339 69.9181 7.28673 46.2848 8.45339 35.1181C9.78673 25.6181 15.4534 5.51811 27.4534 1.11811C42.4534 -4.38189 60.4534 12.1182 67.9534 13.6182Z"
          fill={`url(#${paintAId})`}
          fillOpacity="0.59"
        />
      </g>
      <g data-yuni-body="front" filter={`url(#${filterBId})`}>
        <path
          d="M0 37.4908C0 28.2908 11 21.9908 16.5 19.9908C30 12.4908 31.5 8.23159 36.5 7.49085C50 5.49085 49.5 9.99085 67.5 13.9908C85.5 17.9908 93.5 28.4908 94 33.9908C94.5 39.4908 86 51.4908 81 55.9908C76 60.4908 71.5 70.4909 59.5 74.4909C47.5 78.4909 29 60.4908 20 57.9908C11 55.4908 0 48.9908 0 37.4908Z"
          fill={`url(#${paintBId})`}
          fillOpacity="0.5"
        />
      </g>
      <g data-yuni-eyes>
        <g data-yuni-blink>
          <ellipse cx="31.5" cy="30" rx="6.5" ry="7" fill="white" />
          <ellipse cx="60.5" cy="30" rx="6.5" ry="7" fill="white" />
        </g>
      </g>
      <defs>
        <filter
          id={filterAId}
          x="8"
          y="0"
          width="76.1941"
          height="80.312"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset />
          <feGaussianBlur stdDeviation="6.15" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0" />
          <feBlend mode="normal" in2="shape" result="effect1_innerShadow_69_200" />
        </filter>
        <filter
          id={filterBId}
          x="0"
          y="7"
          width="94.0211"
          height="68.0684"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset />
          <feGaussianBlur stdDeviation="4" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0" />
          <feBlend mode="normal" in2="shape" result="effect1_innerShadow_69_200" />
        </filter>
        <linearGradient
          id={paintAId}
          x1="8.4534"
          y1="40.6182"
          x2="84.4534"
          y2="40.6182"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#CE48F6" />
          <stop offset="1" stopColor="#32FAF5" />
        </linearGradient>
        <linearGradient id={paintBId} x1="39" y1="27" x2="49.5" y2="75" gradientUnits="userSpaceOnUse">
          <stop stopColor="#CE47F5" />
          <stop offset="1" stopColor="#32F9F6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
