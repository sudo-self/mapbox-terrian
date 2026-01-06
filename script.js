mapboxgl.accessToken = "pk.eyJ1Ijoic3Vkby1zZWxmIiwiYSI6ImNtanU4MW13cTNrM3czbnB2OHM2OHVveHAifQ.-GNljr7SnlepPPstxhkzyQ";

// Global variables
let map, planeObject, customLayer;
let planeAltitude = 1000;
const planeSpeed = 0.0001;
const rotationSpeed = 2;
const statusDiv = document.getElementById('status');

function updateStatus(message) {
    statusDiv.textContent = message;
    console.log(message);
}

// Initialize map
function initMap() {
    map = new mapboxgl.Map({
        container: "map",
        zoom: 14,
        center: [-105.0116, 39.4424],
        pitch: 80,
        bearing: 41,
        style: "mapbox://styles/mapbox/standard-satellite"
    });

    map.on("load", () => {
        updateStatus("Map loaded, adding terrain...");
        
        map.addSource("mapbox-dem", {
            type: "raster-dem",
            url: "mapbox://mapbox.mapbox-terrain-dem-v1",
            tileSize: 512,
            maxzoom: 14
        });
        
        map.setTerrain({ source: "mapbox-dem", exaggeration: 3.5 });
        
        // Add plane after terrain is ready
        map.once('idle', () => {
            updateStatus("Terrain ready, adding plane...");
            addPlane();
        });
    });
}

function addPlane() {
    // Create custom layer for 3D model
    customLayer = {
        id: '3d-plane',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function(map, gl) {
            this.map = map;
            this.gl = gl;
            
            // Setup Three.js scene
            this.setupThreeScene();
            
            // Load plane model
            this.loadPlaneModel();
        },
        
        render: function(gl, matrix) {
            // Update camera projection matrix
            this.camera.projectionMatrix.fromArray(matrix);
            this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
            
            // Clear depth buffer
            this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
            
            // Render scene
            this.renderer.state.reset();
            this.renderer.render(this.scene, this.camera);
            this.renderer.resetState();
            
            // Request next frame
            this.map.triggerRepaint();
        }
    };
    
    map.addLayer(customLayer);
}

// Attach methods to customLayer object
customLayer.setupThreeScene = function() {
    updateStatus("Setting up Three.js scene...");
    
    // Create Three.js camera
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    this.scene.add(directionalLight);
    
    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
        canvas: this.map.getCanvas(),
        context: this.gl,
        antialias: true
    });
    
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(window.devicePixelRatio);
};

customLayer.loadPlaneModel = function() {
    updateStatus("Loading plane model...");
    
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        './plane.glb',  // Make sure this file is in the same directory
        (gltf) => {
            updateStatus("Plane model loaded!");
            
            planeObject = gltf.scene;
            
            // Apply initial scale - START SMALL!
            planeObject.scale.set(0.001, 0.001, 0.001);
            
            // Position the plane
            const lngLat = [-105.0116, 39.4424];
            const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
                lngLat,
                planeAltitude
            );
            
            planeObject.position.set(
                mercatorCoord.x,
                mercatorCoord.y,
                mercatorCoord.z
            );
            
            // Initial rotation
            planeObject.rotation.x = Math.PI / 2;  // Horizontal
            planeObject.rotation.y = 0;           // Facing east
            planeObject.rotation.z = 0;
            
            // Add to scene
            this.scene.add(planeObject);
            
            // Add debug: Create a simple visible object at the same location
            this.addDebugMarker(mercatorCoord);
            
            updateStatus("Plane added to scene!");
            
            // Center map on plane
            this.map.flyTo({
                center: lngLat,
                zoom: 14,
                pitch: 80,
                bearing: 0,
                duration: 2000
            });
            
            // Expose adjustment functions
            setupAdjustmentFunctions();
        },
        (progress) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            updateStatus(`Loading: ${percent}%`);
        },
        (error) => {
            updateStatus(`Error loading model: ${error.message}`);
            console.error("GLTF Error:", error);
            this.createFallbackPlane();
        }
    );
};

customLayer.addDebugMarker = function(coord) {
    // Create a simple red cube at plane position for debugging
    const geometry = new THREE.BoxGeometry(0.0005, 0.0005, 0.0005);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const marker = new THREE.Mesh(geometry, material);
    
    marker.position.copy(coord);
    this.scene.add(marker);
    
    console.log("Debug marker added at:", coord);
};

customLayer.createFallbackPlane = function() {
    updateStatus("Creating fallback plane...");
    
    // Create a simple visible plane
    const geometry = new THREE.BoxGeometry(0.001, 0.0002, 0.0005);
    const material = new THREE.MeshPhongMaterial({ 
        color: 0x0000ff,
        transparent: true,
        opacity: 0.8
    });
    
    planeObject = new THREE.Mesh(geometry, material);
    
    const lngLat = [-105.0116, 39.4424];
    const mercatorCoord = mapboxgl.MercatorCoordinate.fromLngLat(
        lngLat,
        planeAltitude
    );
    
    planeObject.position.set(
        mercatorCoord.x,
        mercatorCoord.y,
        mercatorCoord.z
    );
    
    planeObject.scale.set(1, 1, 1);
    planeObject.rotation.x = Math.PI / 2;
    
    this.scene.add(planeObject);
    updateStatus("Fallback plane created!");
    
    setupAdjustmentFunctions();
};

// Movement functions
function movePlane(direction) {
    if (!planeObject) {
        updateStatus("Plane not loaded!");
        return;
    }
    
    const currentPos = planeObject.position;
    let newX = currentPos.x;
    let newY = currentPos.y;
    let newZ = currentPos.z;
    
    const speed = planeSpeed * 50; // Increased for better movement
    
    switch(direction) {
        case 'forward':
            newX += Math.sin(planeObject.rotation.y) * speed;
            newY += Math.cos(planeObject.rotation.y) * speed;
            break;
        case 'backward':
            newX -= Math.sin(planeObject.rotation.y) * speed;
            newY -= Math.cos(planeObject.rotation.y) * speed;
            break;
        case 'left':
            newX += Math.cos(planeObject.rotation.y) * speed;
            newY -= Math.sin(planeObject.rotation.y) * speed;
            break;
        case 'right':
            newX -= Math.cos(planeObject.rotation.y) * speed;
            newY += Math.sin(planeObject.rotation.y) * speed;
            break;
        case 'up':
            newZ += speed * 100;
            planeAltitude += 100;
            break;
        case 'down':
            newZ -= speed * 100;
            planeAltitude -= 100;
            if (planeAltitude < 10) planeAltitude = 10;
            break;
    }
    
    planeObject.position.set(newX, newY, newZ);
    
    // Update map view
    const mercatorCoord = new mapboxgl.MercatorCoordinate(newX, newY, newZ);
    const lngLat = mercatorCoord.toLngLat();
    
    map.flyTo({
        center: [lngLat.lng, lngLat.lat],
        zoom: 14,
        pitch: 80,
        duration: 500
    });
    
    updateStatus(`Moved ${direction} - Alt: ${planeAltitude}m`);
}

function rotatePlane(direction) {
    if (!planeObject) {
        updateStatus("Plane not loaded!");
        return;
    }
    
    const rotationRad = rotationSpeed * Math.PI / 180;
    
    if (direction === 'left') {
        planeObject.rotation.y += rotationRad;
    } else {
        planeObject.rotation.y -= rotationRad;
    }
    
    updateStatus(`Rotated ${direction} - Heading: ${(planeObject.rotation.y * 180 / Math.PI).toFixed(1)}°`);
}

function resetPlane() {
    if (!planeObject) return;
    
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
    planeObject.rotation.y = 0;
    
    map.flyTo({
        center: initialLngLat,
        zoom: 14,
        pitch: 80,
        bearing: 0,
        duration: 2000
    });
    
    updateStatus("Plane reset to initial position");
}

// Setup adjustment functions for console
function setupAdjustmentFunctions() {
    window.adjustPlane = {
        setScale: function(x, y, z) {
            if (!planeObject) return;
            planeObject.scale.set(x, y || x, z || x);
            console.log(`Scale set to: ${x}, ${y || x}, ${z || x}`);
            updateStatus(`Scale: ${x}`);
        },
        
        setPosition: function(lng, lat, alt) {
            if (!planeObject) return;
            if (alt !== undefined) planeAltitude = alt;
            
            const coord = mapboxgl.MercatorCoordinate.fromLngLat(
                [lng, lat],
                planeAltitude
            );
            
            planeObject.position.set(coord.x, coord.y, coord.z);
            console.log(`Position set to: ${lng}, ${lat}, alt: ${planeAltitude}m`);
            updateStatus(`Position updated`);
        },
        
        setRotation: function(x, y, z) {
            if (!planeObject) return;
            if (x !== undefined) planeObject.rotation.x = x;
            if (y !== undefined) planeObject.rotation.y = y;
            if (z !== undefined) planeObject.rotation.z = z;
            console.log(`Rotation set to: X=${x}, Y=${y}, Z=${z}`);
        },
        
        logInfo: function() {
            if (!planeObject) {
                console.log("No plane loaded");
                return;
            }
            console.log("=== Plane Info ===");
            console.log("Position:", planeObject.position);
            console.log("Rotation:", planeObject.rotation);
            console.log("Scale:", planeObject.scale);
            console.log("Altitude:", planeAltitude);
        }
    };
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
    switch(e.key.toLowerCase()) {
        case 'w':
            movePlane('forward');
            break;
        case 's':
            movePlane('backward');
            break;
        case 'a':
            movePlane('left');
            break;
        case 'd':
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
        case 'x':
            rotatePlane('right');
            break;
        case 'r':
            resetPlane();
            break;
    }
});

// Initialize everything
updateStatus("Starting 3D map...");
initMap();
