/**
 * Decodage d'une polyligne encodee (algorithme de Google, precision
 * configurable). Valhalla encode ses traces en precision 1e6, pas 1e5 comme
 * OSRM/Google Maps — l'oublier produit des coordonnees hors de la planete.
 * Retourne des paires [lon, lat] (ordre GeoJSON), pas [lat, lon].
 */
export function decodePolyline(encoded: string, precision = 1e6): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    lat += decodeSignedValue();
    lon += decodeSignedValue();
    points.push([lon / precision, lat / precision]);
  }

  return points;

  function decodeSignedValue(): number {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
