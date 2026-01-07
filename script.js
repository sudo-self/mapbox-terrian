mapboxgl.accessToken =
  "pk.eyJ1Ijoic3Vkby1zZWxmIiwiYSI6ImNtanU4MW13cTNrM3czbnB2OHM2OHVveHAifQ.-GNljr7SnlepPPstxhkzyQ";
const map = new mapboxgl.Map({
  container: "map",
  zoom: 14,
  center: [-105.0116, 39.4424],
  pitch: 80,
  bearing: 41,
  // Choose from Mapbox's core styles, or make your own style with Mapbox Studio
  style: "mapbox://styles/mapbox/standard-satellite"
});

map.on("style.load", () => {
  map.addSource("mapbox-dem", {
    type: "raster-dem",
    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
    tileSize: 512,
    maxzoom: 14
  });
  // add the DEM source as a terrain layer with exaggerated height
  map.setTerrain({ source: "mapbox-dem", exaggeration: 3.5 });
});