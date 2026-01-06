mapboxgl.accessToken = "pk.eyJ1Ijoic3Vkby1zZWxmIiwiYSI6ImNtanU4MW13cTNrM3czbnB2OHM2OHVveHAifQ.-GNljr7SnlepPPstxhkzyQ";

// Global variables
let map, planeObject, scene, camera, renderer;
let planeAltitude = 1000;
let planeSpeed = 0.00005;
let bankAngle = 0;
let pitchAngle = 0;
const statusDiv = document.getElementById('status');
const flightInfoDiv = document.getElementById('flight-info');

// Control variables
let keysPressed = {};
let animationFrameId = null;

// Flight parameters
const FLIGHT_PARAMS = {
    acceleration: 0.000001,
    maxSpeed: 0.0005,
    minSpeed: 0.00001,
    turnRate: 0.02,
    bankRate: 0.03,
    pitchRate: 0.01,
    altitudeRate: 0.5,
    autoLevel: 0.98
};

function updateStatus(message) {
    statusDiv.textContent = message;
}

function updateFlightInfo() {
    if (!planeObject) return;
    
    const mercatorCoord = new mapboxgl.MercatorCoordinate(
        planeObject.position.x,
        planeObject.position.y,
        planeObject.position.z
    );
    const lngLat = mercatorCoord.toLngLat();
    
    const heading = (-planeObject.rotation.y * 180/Math.PI + 360) % 360;
    
    flightInfoDiv.innerHTML = `
        <div>Altitude: <strong>${Math.round(planeAltitude)}m</strong></div>
        <div>Speed: <strong>${(planeSpeed * 1000000).toFixed(1)}</strong></div>
        <div>Position: <strong>${lngLat.lng.toFixed(5)}, ${lngLat.lat.toFixed(5)}</strong></div>
        <div>Heading: <strong>${heading.toFixed(1)}°</strong></div>
        <div>Pitch: <strong>${(pitchAngle * 180/Math.PI).toFixed(1)}°</strong></div>
    `;
}

// Initialize map WITHOUT terrain control
function initMap() {
    map = new mapboxgl.Map({
        container: "map",
        zoom: 14,
        center: [-105.0116, 39.4424],
        pitch: 80,
        bearing: 41,
        style: "mapbox://styles/mapbox/standard-satellite",
        antialias: true,
        // Disable default controls
        attributionControl: false
    });

    // Remove any default controls that might appear
    setTimeout(() => {
        // Remove terrain control if it exists
        const terrainControl = document.querySelector('.mapboxgl-ctrl-terrain');
        if (terrainControl) {
            terrainControl.remove();
        }
        
        // Remove any other controls
        const controls = document.querySelectorAll('.mapboxgl-ctrl');
        controls.forEach(ctrl => {
            if (!ctrl.closest('#info-panel')) { // Don't remove our info panel
                ctrl.remove();
            }
        });
    }, 100);

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
    const customLayer = {
        id: '3d-plane',
        type: 'custom',
        renderingMode: '3d',
        
        onAdd: function(map, gl) {
            this.map = map;
            this.gl = gl;
            
            camera = new THREE.Camera();
            scene = new THREE.Scene();
            scene.fog = new THREE.Fog(0x87CEEB, 1, 20000);
            
            // Add lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);
            
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(1, 1, 1).normalize();
            scene.add(directionalLight);
            
            renderer = new THREE.WebGLRenderer({
                canvas: map.getCanvas(),
                context: gl,
                antialias: true,
                alpha: true
            });
            
            renderer.autoClear = false;
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.outputEncoding = THREE.sRGBEncoding;
            
            loadAirplane();
            startAnimationLoop();
        },
        
        render: function(gl, matrix) {
            camera.projectionMatrix.fromArray(matrix);
            camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
            
            gl.clear(gl.DEPTH_BUFFER_BIT);
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
            
            // Get model info
            const bbox = new THREE.Box3().setFromObject(planeObject);
            const center = bbox.getCenter(new THREE.Vector3());
            const size = bbox.getSize(new THREE.Vector3());
            
            // Center the model
            planeObject.position.sub(center);
            
            // Scale - try different values if needed
            const scale = 0.1; // Increased scale for better visibility
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
            
            // Camera is behind plane
            planeObject.rotation.x = 0;
            planeObject.rotation.y = 0;
            planeObject.rotation.z = 0;
            
            // Make materials more visible
            planeObject.traverse((child) => {
                if (child.isMesh && child.material) {
                    if (child.material.color) {
                        child.material.color.multiplyScalar(2.0); // Brighten more
                    }
                    child.material.transparent = false;
                    child.material.opacity = 1.0;
                    child.material.needsUpdate = true;
                    
                    // Add glow for visibility
                    child.material.emissive = new THREE.Color(0x333333);
                    child.material.emissiveIntensity = 0.3;
                }
            });
            
            scene.add(planeObject);
            updateStatus("Airplane ready! WASD/Arrows to fly");
            
            setupConsoleCommands();
            
            // Center on plane
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
            if (percent % 25 === 0) {
                updateStatus(`Loading: ${percent}%`);
            }
        },
        (error) => {
            updateStatus(`Error loading: ${error.message}`);
            console.error("GLTF Error:", error);
            createVisibleFallback();
        }
    );
}

function createVisibleFallback() {
    updateStatus("Creating visible airplane...");
    
    const group = new THREE.Group();
    
    // Larger, more visible fallback plane
    const fuselageGeometry = new THREE.CylinderGeometry(0.001, 0.001, 0.004, 8);
    const fuselageMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.3
    });
    const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
    fuselage.rotation.z = Math.PI / 2;
    group.add(fuselage);
    
    const wingGeometry = new THREE.BoxGeometry(0.004, 0.0002, 0.001);
    const wingMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.2
    });
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    group.add(wing);
    
    planeObject = group;
    
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
    
    planeObject.rotation.y = 0;
    planeObject.scale.set(2, 2, 2); // Make it larger
    
    scene.add(planeObject);
    updateStatus("Fallback airplane created!");
    
    setupConsoleCommands();
}

// Flight physics and controls
function startAnimationLoop() {
    let lastTime = performance.now();
    
    function animate(currentTime) {
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        
        if (planeObject && deltaTime > 0) {
            // Speed control
            if (keysPressed['shift'] || keysPressed[' ']) {
                planeSpeed = Math.min(planeSpeed + FLIGHT_PARAMS.acceleration * deltaTime * 5, FLIGHT_PARAMS.maxSpeed * 2);
            } else if (keysPressed['control']) {
                planeSpeed = Math.max(planeSpeed - FLIGHT_PARAMS.acceleration * deltaTime * 3, FLIGHT_PARAMS.minSpeed);
            }
            
            // Pitch control
            if (keysPressed['w'] || keysPressed['arrowup']) {
                pitchAngle += FLIGHT_PARAMS.pitchRate * deltaTime;
            }
            if (keysPressed['s'] || keysPressed['arrowdown']) {
                pitchAngle -= FLIGHT_PARAMS.pitchRate * deltaTime;
            }
            
            // Bank/turn control
            let turnInput = 0;
            if (keysPressed['a'] || keysPressed['arrowleft']) {
                turnInput = 1;
                bankAngle += FLIGHT_PARAMS.bankRate * deltaTime;
            } else if (keysPressed['d'] || keysPressed['arrowright']) {
                turnInput = -1;
                bankAngle -= FLIGHT_PARAMS.bankRate * deltaTime;
            } else {
                bankAngle *= FLIGHT_PARAMS.autoLevel;
            }
            
            // Limit angles
            bankAngle = Math.max(Math.min(bankAngle, Math.PI / 4), -Math.PI / 4);
            pitchAngle = Math.max(Math.min(pitchAngle, Math.PI / 3), -Math.PI / 3);
            
            // Apply turning
            if (Math.abs(bankAngle) > 0.01) {
                planeObject.rotation.y += (bankAngle * FLIGHT_PARAMS.turnRate * deltaTime);
            }
            
            planeObject.rotation.y += turnInput * FLIGHT_PARAMS.turnRate * deltaTime;
            planeObject.rotation.x = pitchAngle;
            planeObject.rotation.z = -bankAngle * 0.7;
            
            // Forward movement (camera is behind plane)
            const forwardX = Math.sin(planeObject.rotation.y + Math.PI);
            const forwardY = Math.cos(planeObject.rotation.y + Math.PI);
            
            planeObject.position.x += forwardX * planeSpeed * deltaTime * 60;
            planeObject.position.y += forwardY * planeSpeed * deltaTime * 60;
            
            // Altitude change
            planeObject.position.z += Math.sin(pitchAngle) * planeSpeed * deltaTime * 100;
            planeAltitude += Math.sin(pitchAngle) * planeSpeed * deltaTime * 100000;
            
            // Direct altitude
            if (keysPressed['q']) {
                planeObject.position.z += FLIGHT_PARAMS.altitudeRate * deltaTime;
                planeAltitude += 10 * deltaTime;
            }
            if (keysPressed['e']) {
                planeObject.position.z -= FLIGHT_PARAMS.altitudeRate * deltaTime;
                planeAltitude -= 10 * deltaTime;
                if (planeAltitude < 10) planeAltitude = 10;
            }
            
            // Auto-reduce pitch
            pitchAngle *= 0.95;
            
            // Update camera
            updateCamera();
            
            // Update flight info
            updateFlightInfo();
        }
        
        animationFrameId = requestAnimationFrame(animate);
    }
    
    animate(performance.now());
}

function updateCamera() {
    if (!planeObject) return;
    
    const mercatorCoord = new mapboxgl.MercatorCoordinate(
        planeObject.position.x,
        planeObject.position.y,
        planeObject.position.z
    );
    const lngLat = mercatorCoord.toLngLat();
    
    const currentCenter = map.getCenter();
    const lerpFactor = 0.1;
    const newLng = currentCenter.lng + (lngLat.lng - currentCenter.lng) * lerpFactor;
    const newLat = currentCenter.lat + (lngLat.lat - currentCenter.lat) * lerpFactor;
    
    const planeBearing = -planeObject.rotation.y * (180 / Math.PI);
    
    map.setCenter([newLng, newLat]);
    map.setBearing(planeBearing);
}

// Console commands
function setupConsoleCommands() {
    window.airplane = {
        setSpeed: function(speed) {
            planeSpeed = speed;
            console.log(`Speed set to: ${speed}`);
            updateStatus(`Speed: ${(speed * 1000000).toFixed(1)}`);
        },
        
        setAltitude: function(alt) {
            planeAltitude = alt;
            const currentPos = planeObject.position;
            const mercatorCoord = new mapboxgl.MercatorCoordinate(
                currentPos.x,
                currentPos.y,
                currentPos.z
            );
            const lngLat = mercatorCoord.toLngLat();
            
            const newCoord = mapboxgl.MercatorCoordinate.fromLngLat(
                [lngLat.lng, lngLat.lat],
                planeAltitude
            );
            
            planeObject.position.z = newCoord.z;
            console.log(`Altitude set to: ${alt}m`);
        },
        
        setScale: function(scale) {
            planeObject.scale.set(scale, scale, scale);
            console.log(`Scale set to: ${scale}`);
        },
        
        reset: function() {
            const initialLngLat = [-105.0116, 39.4424];
            planeAltitude = 1000;
            planeSpeed = 0.00005;
            bankAngle = 0;
            pitchAngle = 0;
            
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
            planeObject.rotation.y = 0;
            planeObject.rotation.z = 0;
            
            map.flyTo({
                center: initialLngLat,
                zoom: 14,
                pitch: 80,
                bearing: 0,
                duration: 1000
            });
            
            console.log("Airplane reset");
        },
        
        info: function() {
            const mercatorCoord = new mapboxgl.MercatorCoordinate(
                planeObject.position.x,
                planeObject.position.y,
                planeObject.position.z
            );
            const lngLat = mercatorCoord.toLngLat();
            
            console.log("=== Airplane Info ===");
            console.log(`Position: ${lngLat.lng.toFixed(6)}, ${lngLat.lat.toFixed(6)}`);
            console.log(`Altitude: ${Math.round(planeAltitude)}m`);
            console.log(`Speed: ${(planeSpeed * 1000000).toFixed(1)}`);
            console.log(`Heading: ${((-planeObject.rotation.y * 180/Math.PI + 360) % 360).toFixed(1)}°`);
            console.log(`Pitch: ${(pitchAngle * 180/Math.PI).toFixed(1)}°`);
            console.log(`Bank: ${(bankAngle * 180/Math.PI).toFixed(1)}°`);
        }
    };
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keysPressed[key] = true;
    
    // Prevent default for game control keys
    if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift', 'control', 
        'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
    }
    
    // Reset with R key
    if (key === 'r') {
        e.preventDefault();
        if (window.airplane) airplane.reset();
    }
});

document.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
});

// Clean up any Mapbox controls on page load
window.addEventListener('load', () => {
    // Remove Mapbox logo
    const mapboxLogo = document.querySelector('.mapboxgl-ctrl-logo');
    if (mapboxLogo) mapboxLogo.remove();
    
    // Remove attribution
    const attributions = document.querySelectorAll('.mapboxgl-ctrl-attrib');
    attributions.forEach(attr => attr.remove());
    
    // Remove any other controls
    const controls = document.querySelectorAll('.mapboxgl-ctrl');
    controls.forEach(ctrl => {
        if (!ctrl.closest('#info-panel')) {
            ctrl.remove();
        }
    });
});

// Console help
console.log("=== Flight Controls ===");
console.log("W/↑: Pitch up | S/↓: Pitch down");
console.log("A/←: Turn left | D/→: Turn right");
console.log("Q: Altitude up | E: Altitude down");
console.log("Shift/Space: Boost | Ctrl: Slow");
console.log("R: Reset position");
console.log("");
console.log("Console: airplane.info(), airplane.setSpeed(0.0001)");

// Initialize
updateStatus("Starting flight simulator...");
initMap();
