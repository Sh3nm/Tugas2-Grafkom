"use strict";

var canvas, gl, program;

// array penampung vertex
var points = [];
var normals = [];
var colors = [];

// transformasi
var modelViewMatrix, projectionMatrix;
var modelViewMatrixLoc, normalMatrixLoc;

// kontrol user
var yaw = 0;             // rotasi badan
var bladeSpeed = 30;     // kecepatan rotasi blade
var bladeAngle = 0;      // sudut rotasi blade
var rotorAngle = 0;      // sudut rotasi rotor (berputar sendiri 360°)
var targetSpeed = 30;    // kecepatan target untuk momentum
var currentSpeed = 5;   // kecepatan aktual
var isNightMode = false; // mode malam
var fanSound = null;     // audio untuk suara kipas
var lastSpeedChange = 0; // waktu terakhir perubahan kecepatan

// Camera control
var cameraRadius = 3.0;
var cameraTheta = 0.0;
var cameraPhi = Math.PI/4;
var isDragging = false;
var lastMouseX = 0;
var lastMouseY = 0;
var zoomLevel = 1.0;

// Oscillation
var isOscillating = false;
var oscillateSpeed = 1;
var oscillateRange = 60;
var oscillateAngle = 0;

// Performance monitoring
var frameCount = 0;
var lastFPSUpdate = 0;
var currentFPS = 60;

// Level of Detail
var currentLOD = 'high';
var LODLevels = {
    high: { segments: 24, spokes: 8 },
    medium: { segments: 16, spokes: 6 },
    low: { segments: 12, spokes: 4 }
};

// Motion blur
var isMotionBlurEnabled = true;
var blurAmount = 0;

// theme colors
var themes = {
    classic: {
        base: vec4(0.2, 0.2, 0.2, 1),
        frame: vec4(0.15, 0.15, 0.15, 1),
        blade: vec4(0.5, 0.5, 0.5, 1),
        motor: vec4(0.25, 0.25, 0.25, 1),
        rod: vec4(0.3, 0.3, 0.3, 1)
    },
    modern: {
        base: vec4(0.7, 0.7, 0.7, 1),
        frame: vec4(0.6, 0.6, 0.6, 1),
        blade: vec4(0.8, 0.8, 0.8, 1),
        motor: vec4(0.65, 0.65, 0.65, 1),
        rod: vec4(0.7, 0.7, 0.7, 1)
    },
    retro: {
        base: vec4(0.6, 0.4, 0.2, 1),
        frame: vec4(0.5, 0.3, 0.1, 1),
        blade: vec4(0.7, 0.5, 0.3, 1),
        motor: vec4(0.55, 0.35, 0.15, 1),
        rod: vec4(0.6, 0.4, 0.2, 1)
    }
};

// jumlah vertex tiap bagian (untuk drawArrays dengan offset)
var baseVertices = 0;
var hangingRodVertices = 0;
var motorHousingVertices = 0;
var frameVertices = 0;
var rotorVertices = 0;
var bladeVertices = 0;

// Camera control functions
function initCameraControls() {
    canvas.addEventListener('mousedown', function(e) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        
        var deltaX = e.clientX - lastMouseX;
        var deltaY = e.clientY - lastMouseY;
        
        cameraTheta += deltaX * 0.01;
        cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi + deltaY * 0.01));
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    document.addEventListener('mouseup', function() {
        isDragging = false;
    });

    canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        zoomLevel = Math.max(0.5, Math.min(2.0, zoomLevel + e.deltaY * -0.001));
    });

    document.getElementById('resetCamera').onclick = function() {
        cameraRadius = 3.0;
        cameraTheta = 0.0;
        cameraPhi = Math.PI/4;
        zoomLevel = 1.0;
    };
}

// Performance monitoring
function updateFPS() {
    const now = performance.now();
    if (now - lastFPSUpdate >= 1000) { // Update every second
        currentFPS = frameCount;
        document.getElementById('fpsCounter').textContent = currentFPS;
        frameCount = 0;
        lastFPSUpdate = now;
        
        // Automatic LOD adjustment based on FPS
        if (currentFPS < 30 && currentLOD !== 'low') {
            currentLOD = 'low';
            buildFanGeometry();
            initBuffers();
        } else if (currentFPS > 55 && currentLOD === 'low') {
            currentLOD = 'high';
            buildFanGeometry();
            initBuffers();
        }
    }
    frameCount++;
}

// Motion blur effect
function updateMotionBlur() {
    if (!isMotionBlurEnabled) return;
    
    blurAmount = Math.min(currentSpeed / 60 * 2, 2);
    canvas.style.filter = `blur(${blurAmount}px)`;
}

// Inisialisasi audio
function initAudio() {
    fanSound = new Audio();
    fanSound.src = 'Media/fan-sound.mp3';  // Pastikan file audio tersedia
    fanSound.loop = true;
}

// Update RPM display
function updateRPM() {
    const rpm = Math.round(currentSpeed * 60);  // Konversi ke RPM
    document.getElementById('rpmValue').textContent = rpm;
}

// Update fan sound
function updateFanSound() {
    if (!fanSound) return;
    
    if (document.getElementById('soundToggle').checked && currentSpeed > 0) {
        fanSound.playbackRate = 0.5 + (currentSpeed / 60) * 1.5;  // Adjust pitch based on speed
        fanSound.volume = currentSpeed / 60;  // Adjust volume based on speed
        
        if (fanSound.paused) {
            fanSound.play().catch(e => console.log("Audio playback failed:", e));
        }
    } else {
        fanSound.pause();
    }
}

// Toggle night mode
function toggleNightMode() {
    isNightMode = !isNightMode;
    document.body.classList.toggle('night-mode');
    gl.clearColor(isNightMode ? 0.1 : 1, isNightMode ? 0.1 : 1, isNightMode ? 0.1 : 1, 1);
}

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL2 tidak tersedia di browser ini");
        return;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1, 1, 1, 1);
    gl.enable(gl.DEPTH_TEST);

    // Initialize features
    initAudio();
    initCameraControls();

    // Initialize performance monitoring
    lastFPSUpdate = performance.now();
    document.getElementById('vertexCount').textContent = points.length;

    // Oscillation controls
    document.getElementById('oscillateToggle').onchange = function(e) {
        isOscillating = e.target.checked;
    };
    
    document.getElementById('oscillateSpeed').oninput = function(e) {
        oscillateSpeed = parseFloat(e.target.value);
    };
    
    document.getElementById('oscillateRange').oninput = function(e) {
        oscillateRange = parseFloat(e.target.value);
    };

    // gunakan 1 shader saja
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

  // build geometry and buffers
  buildFanGeometry();
  initBuffers();

  // uniform locations
  modelViewMatrixLoc = gl.getUniformLocation(program, "modelViewMatrix");
  normalMatrixLoc = gl.getUniformLocation(program, "normalMatrix");

  projectionMatrix = perspective(45, canvas.width / canvas.height, 0.1, 100);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, flatten(projectionMatrix));

  // lighting params
  var lightPosLoc = gl.getUniformLocation(program, "lightPosition");
  if (lightPosLoc) gl.uniform3fv(lightPosLoc, flatten(vec3(5, 5, 5)));
  var ambLoc = gl.getUniformLocation(program, "ambientProduct");
  if (ambLoc) gl.uniform3fv(ambLoc, flatten(vec3(0.3, 0.3, 0.3)));
  var diffLoc = gl.getUniformLocation(program, "diffuseProduct");
  if (diffLoc) gl.uniform3fv(diffLoc, flatten(vec3(1.0, 1.0, 1.0)));
  var specLoc = gl.getUniformLocation(program, "specularProduct");
  if (specLoc) gl.uniform3fv(specLoc, flatten(vec3(0.6, 0.6, 0.6)));
  var shinLoc = gl.getUniformLocation(program, "shininess");
  if (shinLoc) gl.uniform1f(shinLoc, 50.0);

  // UI controls
  var speedEl = document.getElementById("speed");
  var speedVal = document.getElementById("speedVal");
  speedEl.oninput = function(e) {
    targetSpeed = parseFloat(e.target.value);
    speedVal.textContent = e.target.value;
    lastSpeedChange = Date.now();
  };

  // Speed preset buttons
  document.getElementById("speedLow").onclick = function() {
    targetSpeed = 20;
    speedEl.value = targetSpeed;
    speedVal.textContent = targetSpeed;
    lastSpeedChange = Date.now();
  };
  
  document.getElementById("speedMed").onclick = function() {
    targetSpeed = 40;
    speedEl.value = targetSpeed;
    speedVal.textContent = targetSpeed;
    lastSpeedChange = Date.now();
  };
  
  document.getElementById("speedHigh").onclick = function() {
    targetSpeed = 60;
    speedEl.value = targetSpeed;
    speedVal.textContent = targetSpeed;
    lastSpeedChange = Date.now();
  };

  // Theme selector
  document.getElementById("themeSelect").onchange = function(e) {
    buildFanGeometry(); // Rebuild with new colors
    initBuffers();
  };

  // Night mode toggle
  document.getElementById("toggleNightMode").onclick = toggleNightMode;

  // Sound toggle
  document.getElementById("soundToggle").onchange = function(e) {
    if (e.target.checked) {
      updateFanSound();
    } else {
      if (fanSound) fanSound.pause();
    }
  };

  var yawEl = document.getElementById("yaw");
  var yawVal = document.getElementById("yawVal");
  if (yawEl) {
    yawEl.oninput = function(e) {
      yaw = parseFloat(e.target.value);
      yawVal.textContent = e.target.value;
    };
  }

  requestAnimationFrame(render);
};

function initBuffers() {
  // posisi
  var vBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(program, "aPosition");
  gl.vertexAttribPointer(aPos, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aPos);

  // normal
  var nBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);
  var aNorm = gl.getAttribLocation(program, "aNormal");
  gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aNorm);

  // warna
  var cBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);
  var aColor = gl.getAttribLocation(program, "aColor");
  gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aColor);
}

// ---------------- GEOMETRY BUILDER ----------------
// ========================================
// GEOMETRY BUILDER - Table Fan Model
// ========================================
// Struktur Lengkap (Referensi: Old Table Fan):
// 1. Base - Dudukan berat di bawah
// 2. Stand/Pole - Tiang vertikal penopang
// 3. Motor Housing - Badan motor belakang (silinder besar)
// 4. Frame Guard - Pelindung kawat depan (rings + spokes)
// 5. Hub - Rotor tengah
// 6. 4 Blades - Bilah kipas yang berputar
// ========================================

function buildFanGeometry() {
  points = []; normals = []; colors = [];

  // 1. BASE - Dudukan berat berbentuk cakram di bawah
  var start = points.length;
//   addCylinderZ(0.4, 0.1, 24, vec3(0, -0.8, 0), vec4(0.2, 0.2, 0.2, 1));
//   baseVertices = points.length - start;

  // 2. STAND/POLE - Tiang vertikal penopang
  start = points.length;
//   addCylinderY(0.05, 1.0, 16, vec3(0, -0.3, 0), vec4(0.3, 0.3, 0.3, 1));
//   hangingRodVertices = points.length - start;

  // 3. MOTOR HOUSING - Badan motor belakang (silinder besar)
  start = points.length;
  addCylinderZ(0.3, 0.25, 24, vec3(0, 0.2, -0.15), vec4(0.25, 0.25, 0.25, 1));
  motorHousingVertices = points.length - start;

  // 3.5 HANGING ROD - Penyangga menggantung dari atas, menempel di belakang motor
  start = points.length;
  addCylinderY(0.02, 1.5, 12, vec3(0, 0.95, -0.15), vec4(0.3, 0.3, 0.3, 1));
  hangingRodVertices = points.length - start;

  // 4. FRAME GUARD - Pelindung kawat depan
  start = points.length;
  // Ring luar
  addCircleRingXY(0.55, 0.02, 60, vec3(0, 0.2, 0.05), vec4(0.15, 0.15, 0.15, 1));
  // Ring tengah
  addCircleRingXY(0.35, 0.015, 48, vec3(0, 0.2, 0.05), vec4(0.15, 0.15, 0.15, 1));
  // Spokes radial
  addSpokesXY(0.55, 8, vec3(0, 0.2, 0.05), vec4(0.15, 0.15, 0.15, 1));
  frameVertices = points.length - start;
  
  // 5. HUB - Rotor tengah (pas di tengah blade, sedikit lebih ke atas)
  start = points.length;
  addCylinderZ(0.08, 0.06, 20, vec3(0, 0.25, 0.0), vec4(0.35, 0.35, 0.35, 1));
  rotorVertices = points.length - start;

  // 6. BLADE - Satu blade (akan digambar 4x dengan offset 90°)
  start = points.length;
  addBladeXY(0.08, 0.5, 0.12, vec4(0.5, 0.5, 0.5, 1));
  bladeVertices = points.length - start;
}

// Fungsi untuk membuat Box/Cube (untuk Base)
function addCube(center, size, color) {
  let sx = size[0]/2, sy = size[1]/2, sz = size[2]/2;
  let v = [
    vec4(center[0]-sx, center[1]-sy, center[2]+sz, 1),
    vec4(center[0]-sx, center[1]+sy, center[2]+sz, 1),
    vec4(center[0]+sx, center[1]+sy, center[2]+sz, 1),
    vec4(center[0]+sx, center[1]-sy, center[2]+sz, 1),
    vec4(center[0]-sx, center[1]-sy, center[2]-sz, 1),
    vec4(center[0]-sx, center[1]+sy, center[2]-sz, 1),
    vec4(center[0]+sx, center[1]+sy, center[2]-sz, 1),
    vec4(center[0]+sx, center[1]-sy, center[2]-sz, 1)
  ];
  let faces = [
    [1,0,3,2],[2,3,7,6],[3,0,4,7],[6,5,1,2],[4,5,6,7],[5,4,0,1]
  ];
  for (let f of faces) {
    let t1 = subtract(v[f[1]], v[f[0]]);
    let t2 = subtract(v[f[2]], v[f[1]]);
    let n = normalize(cross(vec3(t1), vec3(t2)));
    for (let i of [f[0], f[1], f[2], f[0], f[2], f[3]]) {
      points.push(v[i]); normals.push(n); colors.push(color);
    }
  }
}

// addCylinderY - Silinder sepanjang sumbu Y (untuk stand/tiang vertikal)
function addCylinderY(radius, height, segments, center, color) {
  // Side surface dengan radial normals
  for (var i = 0; i < segments; i++) {
    var theta1 = (i / segments) * 2 * Math.PI;
    var theta2 = ((i + 1) / segments) * 2 * Math.PI;
    
    var x1 = Math.cos(theta1) * radius;
    var z1 = Math.sin(theta1) * radius;
    var x2 = Math.cos(theta2) * radius;
    var z2 = Math.sin(theta2) * radius;
    
    var y_bottom = center[1] - height / 2;
    var y_top = center[1] + height / 2;
    
    // Radial normals untuk sisi
    var n1 = normalize(vec3(x1, 0, z1));
    var n2 = normalize(vec3(x2, 0, z2));
    
    // Triangle 1
    points.push(vec4(center[0] + x1, y_bottom, center[2] + z1, 1.0));
    normals.push(n1); colors.push(color);
    
    points.push(vec4(center[0] + x2, y_bottom, center[2] + z2, 1.0));
    normals.push(n2); colors.push(color);
    
    points.push(vec4(center[0] + x2, y_top, center[2] + z2, 1.0));
    normals.push(n2); colors.push(color);
    
    // Triangle 2
    points.push(vec4(center[0] + x1, y_bottom, center[2] + z1, 1.0));
    normals.push(n1); colors.push(color);
    
    points.push(vec4(center[0] + x2, y_top, center[2] + z2, 1.0));
    normals.push(n2); colors.push(color);
    
    points.push(vec4(center[0] + x1, y_top, center[2] + z1, 1.0));
    normals.push(n1); colors.push(color);
  }
  
  // Top cap (normal = +Y)
  for (var i = 0; i < segments; i++) {
    var theta1 = (i / segments) * 2 * Math.PI;
    var theta2 = ((i + 1) / segments) * 2 * Math.PI;
    
    var x1 = Math.cos(theta1) * radius;
    var z1 = Math.sin(theta1) * radius;
    var x2 = Math.cos(theta2) * radius;
    var z2 = Math.sin(theta2) * radius;
    
    var y_top = center[1] + height / 2;
    
    points.push(vec4(center[0], y_top, center[2], 1.0));
    normals.push(vec3(0, 1, 0)); colors.push(color);
    
    points.push(vec4(center[0] + x1, y_top, center[2] + z1, 1.0));
    normals.push(vec3(0, 1, 0)); colors.push(color);
    
    points.push(vec4(center[0] + x2, y_top, center[2] + z2, 1.0));
    normals.push(vec3(0, 1, 0)); colors.push(color);
  }
  
  // Bottom cap (normal = -Y)
  for (var i = 0; i < segments; i++) {
    var theta1 = (i / segments) * 2 * Math.PI;
    var theta2 = ((i + 1) / segments) * 2 * Math.PI;
    
    var x1 = Math.cos(theta1) * radius;
    var z1 = Math.sin(theta1) * radius;
    var x2 = Math.cos(theta2) * radius;
    var z2 = Math.sin(theta2) * radius;
    
    var y_bottom = center[1] - height / 2;
    
    points.push(vec4(center[0], y_bottom, center[2], 1.0));
    normals.push(vec3(0, -1, 0)); colors.push(color);
    
    points.push(vec4(center[0] + x2, y_bottom, center[2] + z2, 1.0));
    normals.push(vec3(0, -1, 0)); colors.push(color);
    
    points.push(vec4(center[0] + x1, y_bottom, center[2] + z1, 1.0));
    normals.push(vec3(0, -1, 0)); colors.push(color);
  }
}

// Fungsi untuk membuat Cylinder dengan normal radial yang benar
// Digunakan untuk: Hanging Rod, Motor Housing, Rotor
function addCylinder(radius, height, segments, center, color) {
  for (let i = 0; i < segments; i++) {
    let theta1 = (i / segments) * 2 * Math.PI;
    let theta2 = ((i+1) / segments) * 2 * Math.PI;
    let x1 = radius * Math.cos(theta1), z1 = radius * Math.sin(theta1);
    let x2 = radius * Math.cos(theta2), z2 = radius * Math.sin(theta2);
    let yBottom = center[1] - height/2, yTop = center[1] + height/2;

    let p1 = vec4(center[0] + x1, yBottom, center[2] + z1, 1);
    let p2 = vec4(center[0] + x2, yBottom, center[2] + z2, 1);
    let p3 = vec4(center[0] + x2, yTop, center[2] + z2, 1);
    let p4 = vec4(center[0] + x1, yTop, center[2] + z1, 1);

    let n1 = normalize(vec3(x1, 0, z1));
    let n2 = normalize(vec3(x2, 0, z2));

    points.push(p1, p2, p3); normals.push(n1, n2, n2); colors.push(color, color, color);
    points.push(p1, p3, p4); normals.push(n1, n2, n1); colors.push(color, color, color);

    let pTop = vec4(center[0], yTop, center[2], 1);
    let nTop = vec3(0,1,0);
    points.push(pTop, p4, p3); for (let k=0;k<3;k++){ normals.push(nTop); colors.push(color); }

    let pBot = vec4(center[0], yBottom, center[2], 1);
    let nBot = vec3(0,-1,0);
    points.push(pBot, p2, p1); for (let k=0;k<3;k++){ normals.push(nBot); colors.push(color); }
  }
}

// Fungsi untuk membuat Circle Ring di plane XY (menghadap ke user)
// Digunakan untuk: Frame lingkaran yang mengelilingi blade
function addCircleRingXY(radius, thickness, segments, center, color) {
  let inner = radius - thickness;
  for (let i=0; i<segments; i++) {
    let theta1 = (i / segments) * 2 * Math.PI;
    let theta2 = ((i+1) / segments) * 2 * Math.PI;
    
    // Ring di plane XY (horizontal)
    let p1o = vec4(center[0] + radius*Math.cos(theta1), center[1] + radius*Math.sin(theta1), center[2], 1);
    let p2o = vec4(center[0] + radius*Math.cos(theta2), center[1] + radius*Math.sin(theta2), center[2], 1);
    let p1i = vec4(center[0] + inner*Math.cos(theta1), center[1] + inner*Math.sin(theta1), center[2], 1);
    let p2i = vec4(center[0] + inner*Math.cos(theta2), center[1] + inner*Math.sin(theta2), center[2], 1);
    
    // Bagian depan (menghadap user, z sedikit ke depan)
    let zFront = center[2] + thickness/2;
    let p1oF = vec4(center[0] + radius*Math.cos(theta1), center[1] + radius*Math.sin(theta1), zFront, 1);
    let p2oF = vec4(center[0] + radius*Math.cos(theta2), center[1] + radius*Math.sin(theta2), zFront, 1);
    let p1iF = vec4(center[0] + inner*Math.cos(theta1), center[1] + inner*Math.sin(theta1), zFront, 1);
    let p2iF = vec4(center[0] + inner*Math.cos(theta2), center[1] + inner*Math.sin(theta2), zFront, 1);
    
    // Bagian belakang
    let zBack = center[2] - thickness/2;
    let p1oB = vec4(center[0] + radius*Math.cos(theta1), center[1] + radius*Math.sin(theta1), zBack, 1);
    let p2oB = vec4(center[0] + radius*Math.cos(theta2), center[1] + radius*Math.sin(theta2), zBack, 1);
    let p1iB = vec4(center[0] + inner*Math.cos(theta1), center[1] + inner*Math.sin(theta1), zBack, 1);
    let p2iB = vec4(center[0] + inner*Math.cos(theta2), center[1] + inner*Math.sin(theta2), zBack, 1);
    
    // Face depan (menghadap user)
    let normalFront = vec3(0, 0, 1);
    points.push(p1iF, p1oF, p2oF, p1iF, p2oF, p2iF);
    for (let k=0; k<6; k++) { normals.push(normalFront); colors.push(color); }
    
    // Face belakang
    let normalBack = vec3(0, 0, -1);
    points.push(p1oB, p1iB, p2iB, p1oB, p2iB, p2oB);
    for (let k=0; k<6; k++) { normals.push(normalBack); colors.push(color); }
    
    // Sisi luar (radial)
    let nx1 = Math.cos(theta1), ny1 = Math.sin(theta1);
    let nx2 = Math.cos(theta2), ny2 = Math.sin(theta2);
    let n1 = vec3(nx1, ny1, 0);
    let n2 = vec3(nx2, ny2, 0);
    points.push(p1oB, p1oF, p2oF, p1oB, p2oF, p2oB);
    normals.push(n1, n1, n2, n1, n2, n2);
    for (let k=0; k<6; k++) { colors.push(color); }
    
    // Sisi dalam (radial terbalik)
    let n1i = vec3(-nx1, -ny1, 0);
    let n2i = vec3(-nx2, -ny2, 0);
    points.push(p1iF, p1iB, p2iB, p1iF, p2iB, p2iF);
    normals.push(n1i, n1i, n2i, n1i, n2i, n2i);
    for (let k=0; k<6; k++) { colors.push(color); }
  }
}

// Fungsi untuk membuat Cylinder dengan sumbu Z (menghadap ke user)
// Digunakan untuk: Hub/Rotor tengah
function addCylinderZ(radius, height, segments, center, color) {
  for (let i = 0; i < segments; i++) {
    let theta1 = (i / segments) * 2 * Math.PI;
    let theta2 = ((i+1) / segments) * 2 * Math.PI;
    
    let x1 = radius * Math.cos(theta1);
    let y1 = radius * Math.sin(theta1);
    let x2 = radius * Math.cos(theta2);
    let y2 = radius * Math.sin(theta2);
    
    let zFront = center[2] + height/2;  // ke arah user
    let zBack = center[2] - height/2;   // ke belakang
    
    // Sisi samping dengan normals radial
    let p1 = vec4(center[0] + x1, center[1] + y1, zBack, 1);
    let p2 = vec4(center[0] + x2, center[1] + y2, zBack, 1);
    let p3 = vec4(center[0] + x2, center[1] + y2, zFront, 1);
    let p4 = vec4(center[0] + x1, center[1] + y1, zFront, 1);
    
    let n1 = normalize(vec3(x1, y1, 0));
    let n2 = normalize(vec3(x2, y2, 0));
    
    points.push(p1, p2, p3);
    normals.push(n1, n2, n2);
    colors.push(color, color, color);
    
    points.push(p1, p3, p4);
    normals.push(n1, n2, n1);
    colors.push(color, color, color);
    
    // Tutup depan (menghadap user)
    let pFront = vec4(center[0], center[1], zFront, 1);
    let nFront = vec3(0, 0, 1);
    points.push(pFront, p4, p3);
    for (let k = 0; k < 3; k++) { normals.push(nFront); colors.push(color); }
    
    // Tutup belakang
    let pBack = vec4(center[0], center[1], zBack, 1);
    let nBack = vec3(0, 0, -1);
    points.push(pBack, p2, p1);
    for (let k = 0; k < 3; k++) { normals.push(nBack); colors.push(color); }
  }
}

// ========================================
// addSpokesXY - Spokes radial untuk frame guard (di plane XY)
// ========================================
function addSpokesXY(radius, numSpokes, center, color) {
  var spokeThickness = 0.01;
  
  for (var i = 0; i < numSpokes; i++) {
    var angle = (i / numSpokes) * 2 * Math.PI;
    var x_end = Math.cos(angle) * radius;
    var y_end = Math.sin(angle) * radius;
    
    // Buat spoke tipis dari center ke edge
    var perpX = -Math.sin(angle) * spokeThickness;
    var perpY = Math.cos(angle) * spokeThickness;
    
    // Front face
    points.push(vec4(center[0], center[1], center[2] + 0.01, 1.0));
    normals.push(vec3(0, 0, 1)); colors.push(color);
    
    points.push(vec4(center[0] + x_end - perpX, center[1] + y_end - perpY, center[2] + 0.01, 1.0));
    normals.push(vec3(0, 0, 1)); colors.push(color);
    
    points.push(vec4(center[0] + x_end + perpX, center[1] + y_end + perpY, center[2] + 0.01, 1.0));
    normals.push(vec3(0, 0, 1)); colors.push(color);
    
    // Back face
    points.push(vec4(center[0], center[1], center[2] - 0.01, 1.0));
    normals.push(vec3(0, 0, -1)); colors.push(color);
    
    points.push(vec4(center[0] + x_end + perpX, center[1] + y_end + perpY, center[2] - 0.01, 1.0));
    normals.push(vec3(0, 0, -1)); colors.push(color);
    
    points.push(vec4(center[0] + x_end - perpX, center[1] + y_end - perpY, center[2] - 0.01, 1.0));
    normals.push(vec3(0, 0, -1)); colors.push(color);
  }
}

// Fungsi untuk membuat jari-jari/spokes dari pusat ke tepi frame
// Digunakan untuk: Frame/Guard (8 spokes radial)
function addFrameSpokes(radius, numSpokes, center, color) {
  let thickness = 0.015;
  for (let i = 0; i < numSpokes; i++) {
    let angle = (i / numSpokes) * 2 * Math.PI;
    let dx = Math.cos(angle), dy = Math.sin(angle);
    let p1 = vec4(center[0] + 0.15*dx, center[1] + 0.15*dy, center[2], 1);
    let p2 = vec4(center[0] + radius*dx, center[1] + radius*dy, center[2], 1);
    let perpX = -dy * thickness, perpY = dx * thickness;
    let v1 = vec4(p1[0] + perpX, p1[1] + perpY, center[2] - thickness, 1);
    let v2 = vec4(p1[0] - perpX, p1[1] - perpY, center[2] - thickness, 1);
    let v3 = vec4(p2[0] - perpX, p2[1] - perpY, center[2] - thickness, 1);
    let v4 = vec4(p2[0] + perpX, p2[1] + perpY, center[2] - thickness, 1);
    let v5 = vec4(p1[0] + perpX, p1[1] + perpY, center[2] + thickness, 1);
    let v6 = vec4(p1[0] - perpX, p1[1] - perpY, center[2] + thickness, 1);
    let v7 = vec4(p2[0] - perpX, p2[1] - perpY, center[2] + thickness, 1);
    let v8 = vec4(p2[0] + perpX, p2[1] + perpY, center[2] + thickness, 1);
    let n = vec3(0,0,1);
    points.push(v5, v6, v7, v5, v7, v8);
    for (let k=0;k<6;k++){ normals.push(n); colors.push(color); }
  }
}

// Fungsi untuk membuat Curved Blade (blade melengkung dengan 12 segmen)
// Blade dimulai dari rotor (r=0.15) sampai dekat frame (r=0.9)
// Memiliki kelengkungan/pitch angle untuk efek aerodinamis
function addCurvedBlade(color) {
  let segments = 12;
  let radiusStart = 0.25;
  let radiusEnd = 0.25;
  let width = 0;
  let curve = 0.25;
  for (let i = 0; i < segments; i++) {
    let t1 = i / segments, t2 = (i+1)/segments;
    let r1 = radiusStart + (radiusEnd - radiusStart) * t1;
    let r2 = radiusStart + (radiusEnd - radiusStart) * t2;
    let z1 = curve * Math.sin(t1 * Math.PI * 0.5);
    let z2 = curve * Math.sin(t2 * Math.PI * 0.5);
    let w1 = width * (1 - t1 * 0.3);
    let w2 = width * (1 - t2 * 0.3);

    let p1 = vec4(0, r1 - w1/2, z1, 1);
    let p2 = vec4(0, r1 + w1/2, z1, 1);
    let p3 = vec4(0, r2 + w2/2, z2, 1);
    let p4 = vec4(0, r2 - w2/2, z2, 1);

    let thick = 0.02;
    let p5 = vec4(-thick, r1 - w1/2, z1, 1);
    let p6 = vec4(-thick, r1 + w1/2, z1, 1);
    let p7 = vec4(-thick, r2 + w2/2, z2, 1);
    let p8 = vec4(-thick, r2 - w2/2, z2, 1);

    let edge1 = subtract(p2, p1);
    let edge2 = subtract(p4, p1);
    let nFront = normalize(cross(vec3(edge1), vec3(edge2)));

    points.push(p1, p2, p3); normals.push(nFront, nFront, nFront); colors.push(color, color, color);
    points.push(p1, p3, p4); normals.push(nFront, nFront, nFront); colors.push(color, color, color);

    let nBack = vec3(-nFront[0], -nFront[1], -nFront[2]);
    points.push(p6, p5, p8); normals.push(nBack, nBack, nBack); colors.push(color, color, color);
    points.push(p6, p8, p7); normals.push(nBack, nBack, nBack); colors.push(color, color, color);

    let edgeTop1 = subtract(p6, p2);
    let edgeTop2 = subtract(p7, p6);
    let nTop = normalize(cross(vec3(edgeTop1), vec3(edgeTop2)));
    points.push(p2, p6, p7, p2, p7, p3); for (let k=0;k<6;k++){ normals.push(nTop); colors.push(color); }

    let edgeBot1 = subtract(p1, p5);
    let edgeBot2 = subtract(p4, p1);
    let nBot = normalize(cross(vec3(edgeBot1), vec3(edgeBot2)));
    points.push(p5, p1, p4, p5, p4, p8); for (let k=0;k<6;k++){ normals.push(nBot); colors.push(color); }
  }
}

// Fungsi untuk membuat Blade di plane XY (menghadap ke user)
// radiusStart: mulai dari hub tengah
// radiusEnd: berakhir sebelum frame
// width: lebar blade
function addBladeXY(radiusStart, radiusEnd, width, color) {
  let thick = 0.03; // ketebalan blade (kedalaman Z)
  
  // Blade berbentuk trapesium di plane XY
  let widthBase = width;      // lebar di pangkal
  let widthTip = width * 0.4; // lebar di ujung (40% dari pangkal)
  
  // Blade berada di sumbu Y positif (mengarah ke atas)
  // 8 vertex untuk trapesium pipih
  let v = [
    // Depan (z = thick/2, menghadap user)
    vec4(-widthBase/2, radiusStart, thick/2, 1),        // 0: kiri-pangkal
    vec4(widthBase/2, radiusStart, thick/2, 1),         // 1: kanan-pangkal
    vec4(widthTip/2, radiusEnd, thick/2, 1),            // 2: kanan-ujung
    vec4(-widthTip/2, radiusEnd, thick/2, 1),           // 3: kiri-ujung
    // Belakang (z = -thick/2)
    vec4(-widthBase/2, radiusStart, -thick/2, 1),       // 4: kiri-pangkal
    vec4(widthBase/2, radiusStart, -thick/2, 1),        // 5: kanan-pangkal
    vec4(widthTip/2, radiusEnd, -thick/2, 1),           // 6: kanan-ujung
    vec4(-widthTip/2, radiusEnd, -thick/2, 1)           // 7: kiri-ujung
  ];
  
  let faces = [
    [0,1,2,3],  // depan (menghadap user, z+)
    [5,4,7,6],  // belakang (z-)
    [4,5,1,0],  // bawah (pangkal, dekat hub)
    [3,2,6,7],  // atas (ujung, dekat frame)
    [4,0,3,7],  // sisi kiri
    [1,5,6,2]   // sisi kanan
  ];
  
  for (let f of faces) {
    let t1 = subtract(v[f[1]], v[f[0]]);
    let t2 = subtract(v[f[2]], v[f[1]]);
    let n = normalize(cross(vec3(t1), vec3(t2)));
    for (let i of [f[0], f[1], f[2], f[0], f[2], f[3]]) {
      points.push(v[i]);
      normals.push(n);
      colors.push(color);
    }
  }
}

// RENDER LOOP - Table Fan Complete Structure
function render() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Update oscillation
  if (isOscillating) {
    oscillateAngle += oscillateSpeed * 0.02;
    yaw = Math.sin(oscillateAngle) * oscillateRange;
    document.getElementById('yaw').value = yaw;
    document.getElementById('yawVal').textContent = Math.round(yaw);
  }

  // Calculate camera position based on spherical coordinates
  var x = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
  var y = cameraRadius * Math.cos(cameraPhi);
  var z = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
  
  // Apply zoom
  x *= zoomLevel;
  y *= zoomLevel;
  z *= zoomLevel;
  
  var eye = vec3(x, y, z);
  var at = vec3(0, 0, 0);
  var up = vec3(0, 1, 0);
  var viewMatrix = lookAt(eye, at, up);

  let offset = 0;

  // ===== 1. BASE (Static - dudukan bawah, tidak ikut yaw) =====
  modelViewMatrix = viewMatrix;
  gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));
  gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(modelViewMatrix)));
  if (baseVertices>0) gl.drawArrays(gl.TRIANGLES, offset, baseVertices);
  offset += baseVertices;

  // ===== 2. STAND/POLE (Static - tiang vertikal, tidak ikut yaw) =====
//   gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));
//   gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(modelViewMatrix)));
//   if (hangingRodVertices>0) gl.drawArrays(gl.TRIANGLES, offset, hangingRodVertices);
//   offset += hangingRodVertices;

  // Yaw transformation untuk semua komponen kipas (motor housing, frame, hub, blade)
  // Rotasi pada sumbu Y dengan pusat di (0, 0.2, 0) - posisi motor housing
  let yawTransform = mult(
    translate(0, 0.2, 0),
    mult(
      rotate(yaw, vec3(0, 1, 0)),
      translate(0, -0.2, 0)
    )
  );
  let yawMV = mult(viewMatrix, yawTransform);

  // ===== 3. MOTOR HOUSING (Dengan yaw rotation) =====
  gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(yawMV));
  gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(yawMV)));
  if (motorHousingVertices>0) gl.drawArrays(gl.TRIANGLES, offset, motorHousingVertices);
  offset += motorHousingVertices;

  // ===== 3.5 HANGING ROD (Dengan yaw rotation) =====
  gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(yawMV));
  gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(yawMV)));
  if (hangingRodVertices>0) gl.drawArrays(gl.TRIANGLES, offset, hangingRodVertices);
  offset += hangingRodVertices;

  // ===== 4. FRAME GUARD (Dengan yaw rotation) =====
  gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(yawMV));
  gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(yawMV)));
  if (frameVertices>0) gl.drawArrays(gl.TRIANGLES, offset, frameVertices);
  offset += frameVertices;

  // ===== 5. HUB TENGAH (Rotor berputar 360° di tempat, tidak ikut blade rotation) =====
  // Rotor berputar pada posisinya sendiri (0, 0.25, 0) dengan rotasi pada sumbu Z
  let hubTransform = mult(
    translate(0, 0.25, 0),
    mult(
      rotate(rotorAngle, vec3(0, 0, 1)),
      translate(0, -0.25, 0)
    )
  );
  let hubMV = mult(yawMV, hubTransform);
  gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(hubMV));
  gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(hubMV)));
  if (rotorVertices>0) gl.drawArrays(gl.TRIANGLES, offset, rotorVertices);
  offset += rotorVertices;

  // ===== 6. BLADES (Dengan yaw + translasi ke atas + blade rotation, 4 blade offset 0°, 90°, 180°, 270°) =====
  let numBlades = 4;
  for (let i=0; i<numBlades; i++) {
    // Translasi ke atas (Y=0.25) untuk sejajarkan dengan rotor, lalu rotasi blade
    let bladeTransform = mult(translate(0, 0.25, 0), rotate(bladeAngle + i*90, vec3(0,0,1)));
    let bladeMV = mult(yawMV, bladeTransform);
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(bladeMV));
    gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(bladeMV)));
    if (bladeVertices>0) gl.drawArrays(gl.TRIANGLES, offset, bladeVertices);
  }

  // Update kecepatan dengan momentum
  const timeSinceChange = (Date.now() - lastSpeedChange) / 1000; // konversi ke detik
  const acceleration = 0.5; // Kecepatan perubahan
  
  if (Math.abs(currentSpeed - targetSpeed) > 0.1) {
    if (currentSpeed < targetSpeed) {
      currentSpeed = Math.min(targetSpeed, currentSpeed + acceleration);
    } else {
      currentSpeed = Math.max(targetSpeed, currentSpeed - acceleration);
    }
  }

  // Update sudut rotasi
  bladeAngle += currentSpeed * 0.15;  // Blade berputar sesuai kecepatan aktual
  rotorAngle += 2.0;                  // Rotor berputar konstan 360° (2 derajat per frame)

  // Update displays dan efek
  updateRPM();
  updateFanSound();
  updateFPS();
  updateMotionBlur();

  requestAnimationFrame(render);
}
