// Convierte un SVG en PNG con sharp (dependencia ya instalada en el monorepo).
// Uso: node render.cjs entrada.svg salida.png [ancho]
const path = require("path");
const repo = path.resolve(__dirname, "../../../..");
const sharp = require(
  require.resolve("sharp", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] })
);

const [, , input, output, width] = process.argv;
sharp(input, { density: 300 })
  .resize({ width: Number(width || 3200) })
  .flatten({ background: "#ffffff" })
  .png()
  .toFile(output)
  .then((info) => console.log(`PNG: ${output} (${info.width}x${info.height})`))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
