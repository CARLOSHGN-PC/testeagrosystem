import JSZip from "jszip";
import shp from "shpjs";

/**
 * Processes shapefile components or a single .zip into GeoJSON.
 * If loose files are provided, it zips them first.
 * @param {File[]} files Array of files that make up the shapefile, or a single .zip file.
 * @returns {Promise<Object>} The parsed GeoJSON object and the zip buffer.
 */
export const processShapefileToGeoJSON = async (files) => {
  let zipBuffer;

  if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
    // If it's already a zip, just use its ArrayBuffer directly
    zipBuffer = await files[0].arrayBuffer();
  } else {
    // Otherwise, it's a collection of loose files. Zip them up.
    const zip = new JSZip();

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      zip.file(file.name, arrayBuffer);
    }

    // Generate the zip file as an ArrayBuffer
    zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
  }

  // Parse the zip buffer into GeoJSON using shpjs
  const geojson = await shp(zipBuffer);

  return { geojson, zipBuffer };
};
