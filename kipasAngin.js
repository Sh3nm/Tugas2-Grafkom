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
var bladeSpeed = 30;     // kecepatan rotasi
var bladeAngle = 0;      // sudut rotasi

// jumlah vertex tiap bagian (untuk drawArrays dengan offset)
var baseVertices = 0;
var hangingRodVertices = 0;
var motorHousingVertices = 0;
var frameVertices = 0;
var rotorVertices = 0;
var bladeVertices = 0;

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
    bladeSpeed = parseFloat(e.target.value);
    speedVal.textContent = e.target.value;
  };
  var yawEl = document.getElementById("yaw");
  var yawVal = document.getElementById("yawVal");
  yawEl.oninput = function(e) {
    yaw = parseFloat(e.target.value);
    yawVal.textContent = e.target.value + "°";
  };

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
function buildFanGeometry() {
  points = []; normals = []; colors = [];

  // 1. BASE
  var start = points.length;
  addCube(vec3(0, -0.2, 0), vec3(1.2, 0.2, 1.2), vec4(0.3,0.3,0.3,1));
  baseVertices = points.length - start;

  // 2. HANGING ROD
  start = points.length;
  addCylinder(0.08, 1.2, 16, vec3(0, 0.5, 0), vec4(0.4,0.4,0.4,1));
  hangingRodVertices = points.length - start;

  // 3. MOTOR HOUSING
  start = points.length;
  addCylinder(0.35, 0.3, 20, vec3(0, 1.1, 0), vec4(0.35,0.35,0.35,1));
  motorHousingVertices = points.length - start;

  // 4. FRAME (ring rings + spokes)
  start = points.length;
  addCircleRing(1.0, 0.025, 60, vec3(0, 1.1, 0.15), vec4(0.2,0.2,0.2,1));
  addCircleRing(0.65, 0.02, 48, vec3(0, 1.1, 0.15), vec4(0.2,0.2,0.2,1));
  addCircleRing(0.35, 0.018, 36, vec3(0, 1.1, 0.15), vec4(0.2,0.2,0.2,1));
  addFrameSpokes(1.0, 8, vec3(0, 1.1, 0.15), vec4(0.2,0.2,0.2,1));
  frameVertices = points.length - start;

  // 5. ROTOR
  start = points.length;
  addCylinder(0.15, 0.08, 20, vec3(0, 1.1, 0.12), vec4(0.4,0.4,0.4,1));
  rotorVertices = points.length - start;

  // 6. BLADE (tambahkan 1 blade geometry; kita akan menggambar 3x dengan transform)
  start = points.length;
  addCurvedBlade(vec4(0.5,0.5,0.5,1));
  bladeVertices = points.length - start;
}

// ---------- shapes (sama seperti versi Anda) ----------
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

function addCircleRing(radius, thickness, segments, center, color) {
  let inner = radius - thickness;
  for (let i=0;i<segments;i++) {
    let theta1 = (i / segments) * 2 * Math.PI;
    let theta2 = ((i+1) / segments) * 2 * Math.PI;
    let p1o = vec4(center[0] + radius*Math.cos(theta1), center[1], center[2] + radius*Math.sin(theta1), 1);
    let p2o = vec4(center[0] + radius*Math.cos(theta2), center[1], center[2] + radius*Math.sin(theta2), 1);
    let p1i = vec4(center[0] + inner*Math.cos(theta1), center[1], center[2] + inner*Math.sin(theta1), 1);
    let p2i = vec4(center[0] + inner*Math.cos(theta2), center[1], center[2] + inner*Math.sin(theta2), 1);
    let normal = vec3(0, 0, 1);
    points.push(p1i, p1o, p2o, p1i, p2o, p2i);
    for (let k=0;k<6;k++){ normals.push(normal); colors.push(color); }
  }
}

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

function addCurvedBlade(color) {
  let segments = 12;
  let radiusStart = 0.15;
  let radiusEnd = 0.9;
  let width = 0.18;
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

// ---------------- RENDER ----------------
function render() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  var eye = vec3(2.5, 1.5, 4);
  var at = vec3(0, 0.9, 0);
  var up = vec3(0, 1, 0);
  var viewMatrix = lookAt(eye, at, up);

  let offset = 0;

  // 1. BASE
  modelViewMatrix = viewMatrix;
  gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));
  gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(modelViewMatrix)));
  if (baseVertices>0) gl.drawArrays(gl.TRIANGLES, offset, baseVertices);
  offset += baseVertices;

  // 2. HANGING ROD
  if (hangingRodVertices>0) gl.drawArrays(gl.TRIANGLES, offset, hangingRodVertices);
  offset += hangingRodVertices;

  // 3. MOTOR HOUSING (ikut yaw)
  let bodyMV = mult(viewMatrix, rotate(yaw, vec3(0,1,0)));
  gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(bodyMV));
  gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(bodyMV)));
  if (motorHousingVertices>0) gl.drawArrays(gl.TRIANGLES, offset, motorHousingVertices);
  offset += motorHousingVertices;

  // 4. FRAME/GUARD (ikut yaw)
  if (frameVertices>0) gl.drawArrays(gl.TRIANGLES, offset, frameVertices);
  offset += frameVertices;

  // 5. ROTOR (ikut yaw + tidak ikut blade spin or we rotate hub slightly)
  let rotorMV = mult(viewMatrix, rotate(yaw, vec3(0,1,0)));
  // rotor rotates together with blades (so rotate Z by bladeAngle)
  rotorMV = mult(rotorMV, rotate(bladeAngle, vec3(0,0,1)));
  gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(rotorMV));
  gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(rotorMV)));
  if (rotorVertices>0) gl.drawArrays(gl.TRIANGLES, offset, rotorVertices);
  offset += rotorVertices;

  // 6. BLADES: gambar 3x dengan offset 120°
  let numBlades = 3;
  for (let i=0;i<numBlades;i++) {
    let bMV = mult(viewMatrix, rotate(yaw, vec3(0,1,0)));
    bMV = mult(bMV, rotate(bladeAngle + i*120, vec3(0,0,1)));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(bMV));
    gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(bMV)));
    if (bladeVertices>0) gl.drawArrays(gl.TRIANGLES, offset, bladeVertices);
  }

  // update
  bladeAngle += bladeSpeed * 0.15;

  requestAnimationFrame(render);
}
