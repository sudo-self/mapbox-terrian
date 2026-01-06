mapboxgl.accessToken = "pk.eyJ1Ijoic3Vkby1zZWxmIiwiYSI6ImNtanU4MW13cTNrM3czbnB2OHM2OHVveHAifQ.-GNljr7SnlepPPstxhkzyQ";

// Global variables
let map, planeObject, scene, camera, renderer;
let planeAltitude = 1000;
const statusDiv = document.getElementById('status');

// Smooth movement variables
let keysPressed = {};
let animationFrameId = null;
const movementSpeed = 0.00002;
const rotationSpeed = 0.03;

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
        style: "mapbox://styles/mapbox/standard-satellite",
        antialias: true
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
        
        map.once('idle', () => {
            updateStatus("Terrain ready, adding plane...");
            setupThreeJS();
        });
    });
}

function setupThreeJS() {
    // Create custom layer for 3D model
    const customLayer = {
        id: '3d-plane',
        type: 'custom',
        renderingMode: '3d',
        
        onAdd: function(map, gl) {
            this.map = map;
            this.gl = gl;
            
            // Create Three.js camera
            camera = new THREE.Camera();
            
            // Create Three.js scene
            scene = new THREE.Scene();
            
            // Add lighting - important for visibility!
            const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
            scene.add(ambientLight);
            
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
            directionalLight.position.set(0, 0, 1).normalize();
            scene.add(directionalLight);
            
            // Create renderer
            renderer = new THREE.WebGLRenderer({
                canvas: map.getCanvas(),
                context: gl,
                antialias: true,
                alpha: true
            });
            
            renderer.autoClear = false;
            renderer.setPixelRatio(window.devicePixelRatio);
            
            // Load the plane
            loadAirplane();
            
            // Start animation loop
            startAnimationLoop();
        },
        
        render: function(gl, matrix) {
            // Set camera projection matrix
            camera.projectionMatrix.fromArray(matrix);
            camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
            
            // Clear only depth buffer
            gl.clear(gl.DEPTH_BUFFER_BIT);
            
            // Render scene
            renderer.state.reset();
            renderer.render(scene, camera);
            renderer.resetState();
            
            map.triggerRepaint();
        }
    };
    
    map.addLayer(customLayer);
}

function loadAirplane() {
    updateStatus("Loading airplane.glb...");
    
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        './airplane.glb',
        (gltf) => {
            updateStatus("Airplane model loaded!");
            
            planeObject = gltf.scene;
            
            // Log model info for debugging
            console.log("Model loaded successfully");
            console.log("Model children:", planeObject.children.length);
            
            // Get bounding box to understand model size
            const bbox = new THREE.Box3().setFromObject(planeObject);
            const center = bbox.getCenter(new THREE.Vector3());
            const size = bbox.getSize(new THREE.Vector3());
            
            console.log("Model size:", size);
            console.log("Model center:", center);
            
            // Center the model at origin
            planeObject.position.sub(center);
            
            // Try different scales - start small and increase
            const scale = 0.001;  // Better starting scale
            planeObject.scale.set(scale, scale, scale);
            
            // Position at initial location
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
            
            // Set initial rotation - airplane should be level and facing north
            planeObject.rotation.x = 0;        // Level (no pitch)
            planeObject.rotation.y = Math.PI;  // Facing north (180°)
            planeObject.rotation.z = 0;        // No roll
            
            // Make all materials more visible
            planeObject.traverse((child) => {
                if (child.isMesh) {
                    console.log("Mesh found:", child.name);
                    
                    if (child.material) {
                        // Brighten the material
                        if (child.material.color) {
                            child.material.color.multiplyScalar(1.5);
                        }
                        
                        // Ensure it's visible
                        child.material.transparent = false;
                        child.material.opacity = 1.0;
                        child.material.needsUpdate = true;
                        
                        // Add some emissive glow for better visibility
                        if (!child.material.emissive) {
                            child.material.emissive = new THREE.Color(0x333333);
                            child.material.emissiveIntensity = 0.3;
                        }
                    }
                }
            });
            
            // Add to scene
            scene.add(planeObject);
            
            updateStatus(`Airplane added! Scale: ${scale}`);
            
            // Setup adjustment functions
            setupAdjustmentFunctions();
            
            // Center map on airplane
            map.flyTo({
                center: lngLat,
                zoom: 14,
                pitch: 80,
                bearing: 0,
                duration: 2000
            });
        },
        (progress) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            if (percent % 25 === 0) { // Update less frequently
                updateStatus(`Loading airplane: ${percent}%`);
            }
        },
        (error) => {
            updateStatus(`Error: ${error.message}`);
            console.error("Failed to load airplane.glb:", error);
            createVisibleFallback();
        }
    );
}

function createVisibleFallback() {
    updateStatus("Creating visible airplane...");
    
    // Create a simple but visible airplane
    const group = new THREE.Group();
    
    // Fuselage (cylinder)
    const fuselageGeometry = new THREE.CylinderGeometry(0.0002, 0.0002, 0.001, 8);
    const fuselageMaterial = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        shininess: 100
    });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    fuselage.rotation.z = Math.PI / 2;
    group.add(fuselage);
    
    // Wings
    const wingGeometry = new THREE.BoxGeometry(0.001, 0.00005, 0.0003);
    const wingMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    group.add(wing);
    
    // Tail
    const tailGeometry = new THREE.BoxGeometry(0.0002, 0.00005, 0.0002);
    const tailMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.position.z = -0.0004;
    group.add(tail);
    
    planeObject = group;
    
    // Position it
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
    
    // Rotate to face north
    planeObject.rotation.y = Math.PI;
    
    scene.add(planeObject);
    updateStatus("Fallback airplane created!");
    
    setupAdjustmentFunctions();
}

// Setup adjustment functions (for browser console)
function setupAdjustmentFunctions() {
    window.adjustPlane = {
        setScale: function(scale) {
            if (!planeObject) return;
            planeObject.scale.set(scale, scale, scale);
            console.log(`Scale set to: ${scale}`);
            updateStatus(`Scale: ${scale}`);
        },
        
        setPosition: function(lng, lat, alt) {
            if (!planeObject) return;
            if (alt !== undefined) planeAltitude = alt;
            
            const coord = mapboxgl.MercatorCoordinate.fromLngLat(
                [lng, lat],
                planeAltitude
            );
            
            planeObject.position.set(coord.x, coord.y, coord.z);
            console.log(`Position: ${lng}, ${lat}, alt: ${planeAltitude}m`);
            updateStatus(`Position updated`);
        },
        
        setRotation: function(x, y, z) {
            if (!planeObject) return;
            if (x !== undefined) planeObject.rotation.x = x;
            if (y !== undefined) planeObject.rotation.y = y;
            if (z !== undefined) planeObject.rotation.z = z;
            console.log(`Rotation set to: X=${x}, Y=${y}, Z=${z}`);
            updateStatus(`Rotation updated`);
        },
        
        logInfo: function() {
            if (!planeObject) {
                console.log("No airplane loaded");
                return;
            }
            console.log("=== Airplane Info ===");
            console.log("Position:", planeObject.position);
            console.log("Rotation:", planeObject.rotation);
            console.log("Scale:", planeObject.scale);
            console.log("Altitude:", planeAltitude);
        }
    };
}

// Smooth animation loop
function startAnimationLoop() {
    function animate() {
        if (planeObject) {
            // Apply smooth continuous movement
            let moved = false;
            
            // Forward/Backward
            if (keysPressed['w'] || keysPressed['ArrowUp']) {
                planeObject.position.x += Math.sin(planeObject.rotation.y) * movementSpeed;
                planeObject.position.y += Math.cos(planeObject.rotation.y) * movementSpeed;
                moved = true;
            }
            if (keysPressed['s'] || keysPressed['ArrowDown']) {
                planeObject.position.x -= Math.sin(planeObject.rotation.y) * movementSpeed;
                planeObject.position.y -= Math.cos(planeObject.rotation.y) * movementSpeed;
                moved = true;
            }
            
            // Strafe Left/Right
            if (keysPressed['a'] || keysPressed['ArrowLeft']) {
                planeObject.position.x += Math.cos(planeObject.rotation.y) * movementSpeed;
                planeObject.position.y -= Math.sin(planeObject.rotation.y) * movementSpeed;
                moved = true;
            }
            if (keysPressed['d'] || keysPressed['ArrowRight']) {
                planeObject.position.x -= Math.cos(planeObject.rotation.y) * movementSpeed;
                planeObject.position.y += Math.sin(planeObject.rotation.y) * movementSpeed;
                moved = true;
            }
            
            // Up/Down
            if (keysPressed['q']) {
                planeObject.position.z += movementSpeed * 10;
                planeAltitude += 10;
                moved = true;
            }
            if (keysPressed['e']) {
                planeObject.position.z -= movementSpeed * 10;
                planeAltitude -= 10;
                if (planeAltitude < 10) planeAltitude = 10;
                moved = true;
            }
            
            // Rotation
            if (keysPressed['z']) {
                planeObject.rotation.y += rotationSpeed;
                moved = true;
            }
            if (keysPressed['c']) {
                planeObject.rotation.y -= rotationSpeed;
                moved = true;
            }
            
            // Pitch up/down
            if (keysPressed['r']) {
                planeObject.rotation.x += rotationSpeed * 0.5;
                moved = true;
            }
            if (keysPressed['f']) {
                planeObject.rotation.x -= rotationSpeed * 0.5;
                moved = true;
            }
            
            // Smooth camera follow
            if (moved) {
                const mercatorCoord = new mapboxgl.MercatorCoordinate(
                    planeObject.position.x,
                    planeObject.position.y,
                    planeObject.position.z
                );
                const lngLat = mercatorCoord.toLngLat();
                
                // Smooth interpolation for camera
                const currentCenter = map.getCenter();
                const newLng = currentCenter.lng + (lngLat.lng - currentCenter.lng) * 0.05;
                const newLat = currentCenter.lat + (lngLat.lat - currentCenter.lat) * 0.05;
                
                map.setCenter([newLng, newLat]);
            }
        }
        
        animationFrameId = requestAnimationFrame(animate);
    }
    
    animate();
}

// Button controls (updated for smooth movement)
function movePlane(direction) {
    if (!planeObject) {
        updateStatus("Plane not loaded!");
        return;
    }
    
    // Map direction to key for smooth movement
    const keyMap = {
        'forward': 'w',
        'backward': 's',
        'left': 'a',
        'right': 'd',
        'up': 'q',
        'down': 'e'
    };
    
    if (keyMap[direction]) {
        keysPressed[keyMap[direction]] = true;
        setTimeout(() => {
            keysPressed[keyMap[direction]] = false;
        }, 200); // Longer duration for button presses
    }
}

function rotatePlane(direction) {
    if (!planeObject) {
        updateStatus("Plane not loaded!");
        return;
    }
    
    const key = direction === 'left' ? 'z' : 'c';
    keysPressed[key] = true;
    setTimeout(() => {
        keysPressed[key] = false;
    }, 200);
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
    
    planeObject.rotation.x = 0;
    planeObject.rotation.y = Math.PI;
    planeObject.rotation.z = 0;
    
    map.flyTo({
        center: initialLngLat,
        zoom: 14,
        pitch: 80,
        bearing: 0,
        duration: 1000
    });
    
    updateStatus("Airplane reset to start position");
}

// Keyboard event listeners
document.addEventListener('keydown', (e) => {
    e.preventDefault(); // Prevent default browser behavior
    keysPressed[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
});

// Helper function to check if airplane.glb exists
function checkAirplaneFile() {
    fetch('./airplane.glb')
        .then(response => {
            if (response.ok) {
                updateStatus("airplane.glb file found");
            } else {
                updateStatus("airplane.glb not found, will create fallback");
            }
        })
        .catch(() => {
            updateStatus("airplane.glb not found, will create fallback");
        });
}

// Initialize
updateStatus("Starting 3D map with airplane...");
checkAirplaneFile();
initMap();
