(function attachSamples(globalScope) {
  "use strict";

  const original2020Data = `
01, 00, 0F, 32, 00, 32, 00, 19, 00, 19, 00, 19, 00, 3F, 64, 32, 64, 32, 64, 32, 64, 32, 64, 32, 64, 32, 64, 32, 64, 32, 32, 32, 00,
02, 00, 05, 32, 00, 32, 00, 19, 00, 0C, 14, 3C, 43,
03, 00, 03, 3C, 2B, 3B, 14, 0C, 00,
04, 00, 03, 32, 00, 0C, 14, 3C, 2E,
05, 00, 06, 32, 2E, 32, 2E, 32, 2E, 3C, 2B, 3B, 14, 0C, 00,
00, 00, 00
  `.trim();

  const original2020 = {
    name: "BMW G20 2020 EU Laserlight - Original",
    author: "BMW factory data",
    left1: original2020Data,
    left2: "",
    right1: original2020Data,
    right2: "",
  };

  original2020.template = `Source: G20 2020 PreLCI EU Laserlight
Description: Original factory welcome-light data

FLM2 Left [43]
Staging1_Data:
${original2020Data}

Staging2_Data:

FLM2 Right [44]
Staging1_Data:
${original2020Data}

Staging2_Data:
`;

  const left1 = `
01, 00, 0F, 2F, 00, 2F, 00, 2F, 00, 2F, 00, 2F, 00, 3C, 64, 32, 64, 32, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 32, 32, 32, 32,
02, 00, 17, 64, 1E, 0F, 1E, 05, 1E, 03, 3C, 01, 3C, 03, 1E, 20, 1E, 03, 4B, 01, 4B, 03, 1E, 0C, 1E, 03, 50, 01, 50, 03, 1E, 20, 1E, 03, 5F, 01, 5F, 03, 1E, 14, 1E, 03, 64, 01, 64, 03, 32, 64, 32,
03, 00, 13, 64, 32, 05, 32, 03, 64, 01, 64, 03, 32, 1E, 32, 03, 55, 01, 55, 03, 32, 0C, 32, 03, 50, 01, 50, 03, 32, 1E, 32, 03, 41, 01, 41, 03, 32, 03, 32, 64, 00,
04, 00, 0B, 64, 1E, 64, 1E, 23, 1E, 06, 1E, 09, 5F, 03, 62, 03, 64, 03, 62, 02, 60, 53, 00, 03, 00,
05, 00, 09, 64, 1E, 64, 1E, 23, 1E, 09, 5F, 03, 62, 03, 64, 03, 62, 02, 60, 4B, 00,
00, 00, 00
  `.trim();

  const right1 = `
01, 00, 0F, 2F, 00, 2F, 00, 2F, 00, 2F, 00, 2F, 00, 3C, 64, 32, 64, 32, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 32, 32, 32, 32,
02, 00, 17, 64, 1E, 0F, 1E, 0F, 1E, 03, 41, 01, 41, 03, 1E, 0C, 1E, 03, 46, 01, 46, 03, 1E, 20, 1E, 03, 55, 01, 55, 03, 1E, 0C, 1E, 03, 5A, 01, 5A, 03, 1E, 1E, 1E, 03, 64, 01, 64, 03, 32, 64, 32,
03, 00, 13, 64, 32, 0E, 32, 03, 5F, 01, 5F, 03, 32, 0C, 32, 03, 5A, 01, 5A, 03, 32, 1E, 32, 03, 4B, 01, 4B, 03, 32, 0C, 32, 03, 46, 01, 46, 03, 32, 0C, 32, 64, 00,
04, 00, 0B, 64, 1E, 64, 1E, 23, 1E, 06, 1E, 09, 5F, 03, 62, 03, 64, 03, 62, 02, 60, 53, 00, 03, 00,
05, 00, 09, 64, 1E, 64, 1E, 23, 1E, 09, 5F, 03, 62, 03, 64, 03, 62, 02, 60, 4B, 00,
00, 00, 00
  `.trim();

  const v15 = {
    name: "BMW G20 2022 EU Laserlight - Left right swipe v15",
    author: "MichaelNRW",
    left1,
    left2: "",
    right1,
    right2: "",
  };

  v15.template = `Author: ${v15.author}
Version 15 - untested

FLM2 Left [43]
Staging1_Data:
${left1}

Staging2_Data:

FLM2 Right [44]
Staging1_Data:
${right1}

Staging2_Data:
`;

  const doubleSwipeFlashLeft = `
01, 00, 0E, 2F, 00, 43, 00, 61, 00, 26, 00, 3C, 64, 32, 64, 32, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 32, 32, 32, 32,
02, 00, 10, 64, 1E, 05, 4C, 01, 4C, 07, 1E, 42, 1E, 03, 3C, 01, 3C, 03, 1E, 1E, 1E, 03, 4B, 01, 4B, 03, 1E, 16, 1E, 0D, 64, 05, 32, 3F, 32,
03, 00, 0B, 64, 32, 4F, 32, 03, 64, 01, 64, 03, 32, 1E, 32, 03, 55, 01, 55, 03, 32, 03, 32, 64, 00,
04, 00, 0C, 70, 1E, 0F, 64, 1E, 1E, 5C, 1E, 06, 1E, 09, 5F, 03, 62, 03, 64, 03, 62, 02, 60, 3D, 1E, 2F, 1E,
05, 00, 0E, 64, 1E, 0D, 5F, 03, 61, 05, 64, 26, 1E, 5A, 1E, 09, 5F, 03, 62, 03, 64, 03, 62, 02, 60, 3B, 1E, 64, 1E, 4A, 00,
00, 00, 00
  `.trim();

  const doubleSwipeFlashRight = `
01, 00, 0E, 2F, 00, 43, 00, 61, 00, 26, 00, 3C, 64, 32, 64, 32, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 32, 32, 32, 32,
02, 00, 12, 64, 1E, 05, 4C, 01, 4C, 07, 1E, 42, 1E, 09, 1E, 03, 41, 01, 41, 03, 1E, 0C, 1E, 03, 46, 01, 46, 03, 1E, 09, 1E, 16, 1E, 0D, 64, 05, 32, 3F, 32,
03, 00, 0C, 64, 32, 4F, 32, 09, 32, 03, 5F, 01, 5F, 03, 32, 0C, 32, 03, 5A, 01, 5A, 03, 32, 0C, 32, 64, 00,
04, 00, 0C, 70, 1E, 0F, 64, 1E, 1E, 5C, 1E, 06, 1E, 09, 5F, 03, 62, 03, 64, 03, 62, 02, 60, 3D, 1E, 30, 1E,
05, 00, 0E, 64, 1E, 0D, 5F, 03, 61, 05, 64, 26, 1E, 5A, 1E, 09, 5F, 03, 62, 03, 64, 03, 62, 02, 60, 3B, 1E, 64, 1E, 4A, 00,
00, 00, 00
  `.trim();

  const doubleSwipeFlash = {
    name: "DoubleSwipe&Flash",
    author: "Curve editor",
    left1: doubleSwipeFlashLeft,
    left2: "",
    right1: doubleSwipeFlashRight,
    right2: "",
  };

  doubleSwipeFlash.template = `Source: G20 2020 PreLCI EU Laserlight
Description: DoubleSwipe&Flash

FLM2 Left [43]
Staging1_Data:
${doubleSwipeFlashLeft}

Staging2_Data:

FLM2 Right [44]
Staging1_Data:
${doubleSwipeFlashRight}

Staging2_Data:
`;

  globalScope.WelcomeLightSamples = { original2020, v15, doubleSwipeFlash };
})(globalThis);
