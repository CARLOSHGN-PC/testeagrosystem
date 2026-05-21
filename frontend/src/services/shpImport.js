import { uploadFile, uploadJson } from "./storage";
import { processShapefileToGeoJSON } from "../utils/geo";

export const validateShapefileSet = (files) => {
  if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
    return true; // We accept a single zip file
  }

  const extensions = files.map((f) => {
    const parts = f.name.split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  });

  const requiredExts = ["shp", "shx", "dbf", "prj"];
  const missing = requiredExts.filter((ext) => !extensions.includes(ext));

  if (missing.length > 0) {
    throw new Error(`Se enviar arquivos soltos, certifique-se de incluir: ${missing.map(e => "." + e).join(", ")}`);
  }

  // Basic check to ensure they share the same base name (excluding zip files)
  const baseNames = new Set(files.map((f) => {
    const parts = f.name.split(".");
    parts.pop();
    return parts.join(".");
  }));

  if (baseNames.size > 1) {
    throw new Error("Todos os arquivos soltos do shapefile devem ter o mesmo nome base.");
  }

  return true;
};

export const importShapefile = async (files, companyId) => {
  if (!companyId) throw new Error("companyId é obrigatório para importar shapefile.");
  try {
    // 1. Validation
    validateShapefileSet(files);

    // 2. Process to GeoJSON locally
    const { geojson: geoJson, zipBuffer } = await processShapefileToGeoJSON(files);

    const timestamp = Date.now();

    // 3. Upload Zipped Original Files to Storage de mapas
    const zipPath = `${companyId}/mapas/shapefiles/${timestamp}/shapefile.zip`;
    // Create a Blob from the ArrayBuffer
    const zipBlob = new Blob([zipBuffer], { type: "application/zip" });
    const zipUrl = await uploadFile(zipPath, zipBlob);

    // 4. Upload Processed GeoJSON to Storage de mapas
    const processedPath = `${companyId}/mapas/processados/geojson_${timestamp}.json`;
    const geoJsonUrl = await uploadJson(processedPath, geoJson);

    // 5. Force UI to fetch the newly uploaded map via CustomEvent
    // This tells the app that a new map was just uploaded and it needs to fetch it
    setTimeout(() => {
       window.dispatchEvent(new CustomEvent('map-updated', { detail: { companyId } }));
    }, 1000);

    return {
      success: true,
      geoJson,
      geoJsonUrl,
      zipUrl,
      message: "Shapefile processado e armazenado com sucesso.",
    };
  } catch (error) {
    let errorMessage = error.message || "Erro desconhecido ao processar shapefile.";

    // Check for Storage de mapas permission errors
    if (error.code === 'storage/unauthorized' || errorMessage.includes('permission to access') || errorMessage.includes('403')) {
      errorMessage = "Acesso Negado (403): O Storage de mapas bloqueou o envio. Vá ao Console do PostgreSQL > Storage > Rules e altere temporariamente para: 'allow read, write: if true;' ou configure a autenticação.";
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};
