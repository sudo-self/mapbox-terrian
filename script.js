mapboxgl.accessToken = "pk.eyJ1Ijoic3Vkby1zZWxmIiwiYSI6ImNtanU4MW13cTNrM3czbnB2OHM2OHVveHAifQ.-GNljr7SnlepPPstxhkzyQ";

// Debug status display
const statusDiv = document.getElementById('status');

function updateStatus(message) {
    statusDiv.textContent = message;
    console.log(message);
}

const map = new mapboxgl.Map({
    container: "map",
    zoom: 14,
    center: [-105.0116, 39.4424],
    pitch: 80,
    bearing: 41,
    style: "mapbox://styles/mapbox/standard-satellite"
});

let planeModel = null;
let planeObject = null;
let planeAltitude = 1000;
const planeSpeed = 0.0001;
const rotationSpeed = 2;
let customLayerAdded = false;

map.on("style.load", () => {
    updateStatus("Style loaded, adding terrain...");
    
    map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14
    });
    
    map.setTerrain({ source: "mapbox-dem", exaggeration: 3.5 });
    updateStatus("Terrain loaded, waiting for map to be ready...");
    
    // Wait for terrain to load
    map.once('idle', () => {
        updateStatus("Map ready, adding plane...");
        addPlaneModel();
    });
});

function addPlaneModel() {
    updateStatus("Starting to add plane model...");
    
    // Make sure we have terrain loaded
    if (!map.getTerrain()) {
        updateStatus("Warning: Terrain not loaded yet");
    }
    
    // Check if model file exists
    fetch('/plane.glb')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            updateStatus("plane.glb file found, loading 3D model...");
            return response.blob();
        })
        .then(blob => {
            console.log("Model file size:", blob.size, "bytes");
            if (blob.size === 0) {
                throw new Error("Model file is empty");
            }
        })
        .catch(error => {
            updateStatus(`Error accessing plane.glb: ${error.message}`);
            console.error("File access error:", error);
        });
    
    if (customLayerAdded) {
        updateStatus("Custom layer already added");
        return;
    }
    
    const customLayer = {
        id: '3d-plane',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function(map, gl) {
            updateStatus("Setting up Three.js scene...");
            this.camera = new THREE.Camera();
            this.scene = new THREE.Scene();
            this.scene.fog = new THREE.Fog(0x87ceeb, 1, 10000);
            
            // Add lights
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(1, -1, 1).normalize();
            this.scene.add(directionalLight);
            
            const ambientLight = new THREE.AmbientLight(0x404040, 2);
            this.scene.add(ambientLight);
            
            const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x404040, 1);
            this.scene.add(hemisphereLight);
            
            // Setup renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas: map.getCanvas(),
                context: gl,
                antialias: true
            });
            
            this.renderer.autoClear = false;
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            
            updateStatus("Loading plane.glb model...");
            
            // Try to load the GLB model
            const loader = new THREE.GLTFLoader();
            
            loader.load(
                './plane.glb',
                (gltf) => {
                    updateStatus("Model loaded successfully!");
                    console.log("GLTF scene:", gltf.scene);
                    console.log("Model animations:", gltf.animations);
                    
                    planeModel = gltf.scene;
                    
                    // Scale and position the model
                    planeModel.scale.set(100, 100, 100);
                    
                    // Try to find the model's bounding box
                    const bbox = new THREE.Box3().setFromObject(planeModel);
                    const size = bbox.getSize(new THREE.Vector3());
                    console.log("Model size:", size);
                    
                    // Position the plane
                    const planeLngLat = [-105.0116, 39.4424];
                    const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
                        planeLngLat,
                        planeAltitude
                    );
                    
                    planeModel.position.set(
                        mercatorCoord.x,
                        mercatorCoord.y,
                        mercatorCoord.z
                    );
                    
                    // Try different rotations to make it visible
                    planeModel.rotation.x = Math.PI / 2; // Make it horizontal
                    planeModel.rotation.z = Math.PI; // Rotate to face north
                    
                    // Try to make it more visible
                    planeModel.traverse((child) => {
                        if (child.isMesh) {
                            console.log("Found mesh:", child);
                            child.material = child.material.clone();
                            child.material.color.set(0xff0000); // Make it red for visibility
                            child.material.needsUpdate = true;
                        }
                    });
                    
                    this.scene.add(planeModel);
                    planeObject = planeModel;
                    
                    updateStatus("Plane added to scene!");
                    
                    // Test: Add a visible marker at the same location
                    addDebugMarker(planeLngLat, planeAltitude);
                    
                    // Center on plane
                    map.flyTo({
                        center: planeLngLat,
                        zoom: 14,
                        pitch: 80,
                        bearing: 41,
                        duration: 2000
                    });
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total * 100).toFixed(1);
                    updateStatus(`Loading model: ${percent}%`);
                    console.log(`Loading progress: ${percent}%`);
                },
                (error) => {
                    updateStatus(`Error loading model: ${error.message}`);
                    console.error("GLTF loading error:", error);
                    
                    // Create a simple visible fallback
                    createFallbackPlane.call(this);
                }
            );
            
            function createFallbackPlane() {
                updateStatus("Creating fallback plane...");
                
                // Create a more visible fallback plane
                const geometry = new THREE.BoxGeometry(0.002, 0.0005, 0.001);
                const material = new THREE.MeshPhongMaterial({
                    color: 0xff0000, // Bright red
                    emissive: 0xff0000,
                    emissiveIntensity: 0.5,
                    transparent: true,
                    opacity: 0.8
                });
                
                planeModel = new THREE.Mesh(geometry, material);
                
                const planeLngLat = [-105.0116, 39.4424];
                const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
                    planeLngLat,
                    planeAltitude
                );
                
                planeModel.position.set(
                    mercatorCoord.x,
                    mercatorCoord.y,
                    mercatorCoord.z
                );
                
                // Make it clearly visible
                planeModel.scale.set(2, 2, 2);
                planeModel.rotation.x = Math.PI / 2;
                
                this.scene.add(planeModel);
                planeObject = planeModel;
                
                updateStatus("Fallback plane created!");
                
                // Add marker for reference
                addDebugMarker(planeLngLat, planeAltitude);
            }
            
            // Add debug function to place a marker at plane location
            function addDebugMarker(lngLat, altitude) {
                // Create a simple sphere marker
                const markerGeometry = new THREE.SphereGeometry(0.001, 16, 16);
                const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                
                const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
                    lngLat,
                    altitude
                );
                
                marker.position.set(
                    mercatorCoord.x,
                    mercatorCoord.y,
                    mercatorCoord.z
                );
                
                this.scene.add(marker);
                console.log("Debug marker added at:", lngLat, "altitude:", altitude);
            }
        },
        
        render: function(gl, matrix) {
            const modelMatrix = new THREE.Matrix4().fromArray(matrix);
            
            if (planeObject) {
                // Always update plane's position relative to camera
                const cameraMatrix = new THREE.Matrix4().fromArray(matrix);
                const planeMatrix = new THREE.Matrix4()
                    .makeTranslation(
                        planeObject.position.x,
                        planeObject.position.y,
                        planeObject.position.z
                    )
                    .multiply(new THREE.Matrix4().makeRotationY(planeObject.rotation.y))
                    .multiply(new THREE.Matrix4().makeRotationX(planeObject.rotation.x))
                    .multiply(cameraMatrix);
                
                this.camera.projectionMatrix = planeMatrix;
            } else {
                this.camera.projectionMatrix = modelMatrix;
            }
            
            this.renderer.state.reset();
            this.renderer.render(this.scene, this.camera);
            this.renderer.resetState();
            
            // Force map repaint
            map.triggerRepaint();
        }
    };
    
    try {
        map.addLayer(customLayer);
        customLayerAdded = true;
        updateStatus("Custom layer added to map");
    } catch (error) {
        updateStatus(`Error adding layer: ${error.message}`);
        console.error("Layer addition error:", error);
    }
}

// Movement functions (same as before, but with status updates)
function movePlane(direction) {
    if (!planeObject) {
        updateStatus("Plane not loaded yet!");
        return;
    }
    
    updateStatus(`Moving plane: ${direction}`);
    
    const currentPos = planeObject.position;
    let newX = currentPos.x;
    let newY = currentPos.y;
    let newZ = currentPos.z;
    
    switch(direction) {
        case 'forward':
            newX += Math.sin(planeObject.rotation.y) * planeSpeed * 10;
            newY += Math.cos(planeObject.rotation.y) * planeSpeed * 10;
            break;
        case 'backward':
            newX -= Math.sin(planeObject.rotation.y) * planeSpeed * 10;
            newY -= Math.cos(planeObject.rotation.y) * planeSpeed * 10;
            break;
        case 'left':
            newX += Math.cos(planeObject.rotation.y) * planeSpeed * 10;
            newY -= Math.sin(planeObject.rotation.y) * planeSpeed * 10;
            break;
        case 'right':
            newX -= Math.cos(planeObject.rotation.y) * planeSpeed * 10;
            newY += Math.sin(planeObject.rotation.y) * planeSpeed * 10;
            break;
        case 'up':
            newZ += planeSpeed * 100;
            planeAltitude += 50;
            break;
        case 'down':
            newZ -= planeSpeed * 100;
            planeAltitude -= 50;
            break;
    }
    
    planeObject.position.set(newX, newY, newZ);
    
    // Convert to lat/lng and update view
    const mercatorCoord = new mapboxgl.MercatorCoordinate(newX, newY, newZ);
    const lngLat = mercatorCoord.toLngLat();
    
    map.flyTo({
        center: [lngLat.lng, lngLat.lat],
        zoom: 14,
        pitch: 80,
        duration: 100
    });
}

function rotatePlane(direction) {
    if (!planeObject) {
        updateStatus("Plane not loaded yet!");
        return;
    }
    
    if (direction === 'left') {
        planeObject.rotation.y += rotationSpeed * Math.PI / 180;
    } else if (direction === 'right') {
        planeObject.rotation.y -= rotationSpeed * Math.PI / 180;
    }
    
    updateStatus(`Plane rotated ${direction}`);
}

function resetPlane() {
    if (!planeObject) return;
    
    updateStatus("Resetting plane position...");
    
    const initialLngLat = [-105.0116, 39.4424];
    planeAltitude = 1000;
    
    const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
        initialLngLat,
        planeAltitude
    );
    
    planeObject.position.set(
        mercatorCoord.x,
        mercatorCoord.y,
        mercatorCoord.z
    );
    
    planeObject.rotation.x = Math.PI / 2;
    planeObject.rotation.y = Math.PI;
    
    map.flyTo({
        center: initialLngLat,
        zoom: 14,
        pitch: 80,
        bearing: 41,
        duration: 2000
    });
}

// Add keyboard controls
document.addEventListener('keydown', (e) => {
    e.preventDefault();
    
    switch(e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
            movePlane('forward');
            break;
        case 's':
        case 'arrowdown':
            movePlane('backward');
            break;
        case 'a':
        case 'arrowleft':
            movePlane('left');
            break;
        case 'd':
        case 'arrowright':
            movePlane('right');
            break;
        case 'q':
            movePlane('up');
            break;
        case 'e':
            movePlane('down');
            break;
        case 'z':
            rotatePlane('left');
            break;
        case 'c':
            rotatePlane('right');
            break;
        case 'r':
            resetPlane();
            break;
    }
});

// Test function to manually trigger plane addition
window.debugAddPlane = function() {
    addPlaneModel();
};

updateStatus("Map initialization started...");
