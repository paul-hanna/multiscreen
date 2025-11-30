//
//    URL PARAMETER: ?splits=[number of split screens]
//
const urlParams       = new URLSearchParams(window.location.search);
const PERMITTED_SPLITS = parseInt(urlParams.get('splits')) || 1;  // how many face‐windows to show

const CAP_W       = 640;          
const CAP_H       = 480;
const LERP_FACTOR = 0.06;        //zoommspeed
const BBOX_MARGIN = 1.4;          // 1 = exact fit, >1 = looser
const SCAN_LINES  = 4;
let screenshots = [];
let lastCaptureTime = 0;
const CAPTURE_INTERVAL = 2000; // ms

let video;
let faceMesh;
let detections = [];             
let cx = 0, cy = 0, zoom = 1;     
let tx = 0, ty = 0, tz = 1;      
const options = { maxFaces: 5, refineLandmarks: false, flipHorizontal: false };


function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  video = createCapture(
    { video: { width: CAP_W, height: CAP_H } },
    () => console.log("webcam ready")
  );
  video.hide();

  faceMesh = ml5.faceMesh(options, modelReady);

  textFont("monospace");
  textSize(12);
};

function modelReady() {
  console.log('facemesh loaded');
  faceMesh.detectStart(video, gotResults);
}

function gotResults(results, error) {
  if (error) {
    console.error(error);
    return;
  }
  detections = results;
  if (detections.length) {
    // if it's the first frame with a face, reset timer
    if (lastCaptureTime === 0) {
      lastCaptureTime = millis();
    }
  } else {
    // no faces, reset
    lastCaptureTime = 0;
  }
}


function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  background(0);

  if (PERMITTED_SPLITS > 1 && detections.length > 0) {
    // split-screen branch
    const count  = min(detections.length, PERMITTED_SPLITS);
    const splitW = width  / count;
    const splitH = height;

    for (let i = 0; i < count; i++) {
      const p = detections[i];
      const { xMin, yMin, xMax, yMax } = p.box;
      const boxW = xMax - xMin;
      const boxH = yMax - yMin;
      const midX = xMin + boxW / 2;
      const midY = yMin + boxH / 2;
      const s    = min(CAP_W / (boxW * BBOX_MARGIN),
                       CAP_H / (boxH * BBOX_MARGIN));
      const tzLocal = constrain(s, 1, 5);

      push();
        // center this split
        translate(i * splitW + splitW/2, splitH/2);
        // scale to cover
        const cover = max(splitW / CAP_W, splitH / CAP_H);
        scale(cover * tzLocal);
        // pan to face
        translate(-midX, -midY);
        image(video, 0, 0, CAP_W, CAP_H);
        noFill();
        stroke(0,255,0,160);
        strokeWeight(2 / tzLocal);
        rect(xMin, yMin, boxW, boxH);
      pop();
    }

  } else {
    // single-window branch
    updateCameraTarget();
    cx   = lerp(cx,   tx, LERP_FACTOR);
    cy   = lerp(cy,   ty, LERP_FACTOR);
    zoom = lerp(zoom, tz, LERP_FACTOR);

    const cover = max(width / CAP_W, height / CAP_H);

    push();
      translate(width / 2, height / 2);
      scale(cover * zoom);
      translate(-cx, -cy);
      image(video, 0, 0, CAP_W, CAP_H);
      drawFaceBoxes();
    pop();
  }

  // apply the green tint over the final frame
  applyGreenTint();

  drawHUD();

  // define thumbnail size *after* all camera drawing
  const thumbW = 120;
  const thumbH = thumbW * (CAP_H / CAP_W);

  if (detections.length && millis() - lastCaptureTime > CAPTURE_INTERVAL) {
    screenshots.push( get(0, 0, width, height) );
    lastCaptureTime = millis();

    const spacing   = 10;
    const maxThumbs = floor((width - spacing) / (thumbW + spacing));
    if (screenshots.length > maxThumbs) screenshots.shift();
  }

  for (let i = 0; i < screenshots.length; i++) {
    const x = 10 + i * (thumbW + 10);
    const y = height - thumbH - 10;
    image(screenshots[i], x, y, thumbW, thumbH);
    noFill();
    stroke(255);
    rect(x, y, thumbW, thumbH);
  }
}




function updateCameraTarget() {
  if (!detections.length) {
    tx = CAP_W/2; ty = CAP_H/2; tz = 1;
    return;
  }
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  detections.forEach(p => {
    const { xMin, yMin, xMax, yMax } = p.box;
    left   = min(left,   xMin);
    right  = max(right,  xMax);
    top    = min(top,    yMin);
    bottom = max(bottom, yMax);
  });
  const boxW = right - left;
  const boxH = bottom - top;
  const midX = left + boxW/2;
  const midY = top  + boxH/2;
  const s    = min(CAP_W/(boxW*BBOX_MARGIN),
                   CAP_H/(boxH*BBOX_MARGIN));
  tx = midX; ty = midY; tz = constrain(s, 1, 5);
}

function applyGreenTint() {
  loadPixels();
  for (let i = 0; i < pixels.length; i += 4) {
    const g = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    pixels[i]     = g * 0.4;   
    pixels[i + 1] = g * 0.9; 
    pixels[i + 2] = g * 0.4; 
  }
  updatePixels();
}

function drawFaceBoxes() {
  noFill();
  stroke(0,255,0,160);
  strokeWeight(2/zoom);
  detections.forEach(p => {
    const { xMin, yMin, xMax, yMax } = p.box;
    rect(xMin, yMin, xMax - xMin, yMax - yMin);
  });
}
function drawHUD() {
  stroke(0, 90);
  strokeWeight(1);
  for (let y = 0; y < height; y += SCAN_LINES) {
    line(0, y, width, y);
  }

  noStroke();
  fill(0, 255, 0);
  const t = nf(hour(), 2) + ":" + nf(minute(), 2) + ":" + nf(second(), 2);
  text("CAM 01  " + t, 10, 20);

  fill(frameCount % 30 < 15 ? color(255, 0, 0) : color(0, 255, 0));
  text("REC", width - 46, 20);
}

function keyPressed() {
  if (key === 'f' || key === 'F') {
    fullscreen( !fullscreen() );
  }
}